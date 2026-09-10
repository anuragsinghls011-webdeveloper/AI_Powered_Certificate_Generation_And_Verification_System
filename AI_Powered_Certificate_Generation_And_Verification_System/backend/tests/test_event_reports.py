"""Event Reports API regression tests (auth, scope, summary, CSV/XLSX integrity, edge cases)."""
import csv
import io
import json
import os
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

import pytest
import requests
from pymongo import MongoClient


def _read_env(path):
    env = {}
    if not os.path.exists(path):
        return env
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


ROOT = Path(__file__).resolve().parents[2]
FRONT_ENV = _read_env(ROOT / "frontend" / ".env")
BACK_ENV = _read_env(ROOT / "backend" / ".env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or FRONT_ENV.get("REACT_APP_BACKEND_URL")
MONGO_URL = os.environ.get("MONGO_URL") or BACK_ENV.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or BACK_ENV.get("DB_NAME")

ADMIN_EMAIL = os.environ.get("REPORT_TEST_ADMIN_EMAIL") or BACK_ENV.get("REPORT_TEST_ADMIN_EMAIL")
ADMIN_PASSWORD = os.environ.get("REPORT_TEST_ADMIN_PASSWORD") or BACK_ENV.get("REPORT_TEST_ADMIN_PASSWORD")


def _uid(prefix="TEST_RPT"):
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


def _xlsx_read(bytes_blob):
    zf = zipfile.ZipFile(io.BytesIO(bytes_blob))
    wb = ET.fromstring(zf.read("xl/workbook.xml"))
    ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main", "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}
    sheets = []
    for sh in wb.findall("x:sheets/x:sheet", ns):
        sheets.append((sh.attrib.get("name"), sh.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")))
    rel = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    rel_ns = {"r": "http://schemas.openxmlformats.org/package/2006/relationships"}
    rel_map = {r.attrib["Id"]: r.attrib["Target"] for r in rel.findall("r:Relationship", rel_ns)}

    shared = []
    if "xl/sharedStrings.xml" in zf.namelist():
        sst = ET.fromstring(zf.read("xl/sharedStrings.xml"))
        for si in sst.findall("x:si", ns):
            texts = [t.text or "" for t in si.findall(".//x:t", ns)]
            shared.append("".join(texts))

    def read_sheet_rows(target):
        xml = ET.fromstring(zf.read(f"xl/{target}".replace("xl/xl/", "xl/")))
        rows = []
        for row in xml.findall("x:sheetData/x:row", ns):
            vals = []
            for c in row.findall("x:c", ns):
                t = c.attrib.get("t")
                v = c.find("x:v", ns)
                if v is None:
                    vals.append("")
                elif t == "s":
                    vals.append(shared[int(v.text)])
                else:
                    vals.append(v.text)
            rows.append(vals)
        return rows

    named = {}
    for name, rid in sheets:
        named[name] = read_sheet_rows(rel_map[rid])
    return named


@pytest.fixture(scope="module")
def ctx():
    if not BASE_URL:
        pytest.fail("REACT_APP_BACKEND_URL is required")
    if not MONGO_URL or not DB_NAME:
        pytest.fail("MONGO_URL and DB_NAME are required")

    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]

    admin = requests.Session()
    admin.headers.update({"Content-Type": "application/json"})
    login = admin.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    if login.status_code != 200:
        pytest.fail(f"Admin login failed: {login.status_code} {login.text}")
    payload = login.json()
    org_id = payload["organization"]["id"]

    created = {
        "org_id": org_id,
        "events": [],
        "event_object_ids": [],
        "users": [],
        "cert_prefixes": ["TEST_RPT_", "RPTLARGE_", "RPTOBJ_", "RPTMETA_", "RPTHUGE_"],
    }

    yield {"admin": admin, "db": db, "created": created}

    # cleanup test users and memberships
    if created["users"]:
        user_ids = [u["id"] for u in created["users"]]
        db.organization_memberships.delete_many({"user_id": {"$in": user_ids}})
        db.users.delete_many({"id": {"$in": user_ids}})

    # cleanup events created by API
    for eid in created["events"]:
        admin.delete(f"{BASE_URL}/api/events/{eid}", timeout=30)

    # cleanup events inserted directly
    if created["event_object_ids"]:
        db.events.delete_many({"_id": {"$in": created["event_object_ids"]}})

    # cleanup report cert documents
    cert_or = [{"cert_id": {"$regex": f"^{p}"}} for p in created["cert_prefixes"]]
    db.certificates.delete_many({"$or": cert_or})

    # cleanup foreign test orgs
    db.organizations.delete_many({"name": {"$regex": "^TEST_RPT_FOREIGN_"}})
    client.close()


def _create_event(session, title, date="2026-02-02"):
    body = {
        "title": title,
        "category": "Workshop",
        "date": date,
        "organizer": "QA",
        "location": "Lab",
        "description": "Report test fixture"
    }
    r = session.post(f"{BASE_URL}/api/events", json=body, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    return d["event"]


def _insert_cert(db, **overrides):
    base = {
        "cert_id": _uid("TEST_RPT"),
        "recipient_name": "Report Test",
        "recipient_email": "report.test@example.com",
        "issue_date": "2026-02-02",
        "status": "Active",
        "metadata": {"dept": "QA"},
        "role": "Participant",
        "grade": "Pass",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    base.update(overrides)
    db.certificates.insert_one(base)
    return base


def _get_rows_from_csv(blob):
    text = blob.decode("utf-8-sig")
    return list(csv.reader(io.StringIO(text)))


# --- Authentication and role access behavior ---
def test_reports_requires_auth():
    r = requests.get(f"{BASE_URL}/api/reports/events", timeout=30)
    assert r.status_code == 401
    body = r.json()
    assert "error" in body


def test_reports_forbidden_for_editor_and_viewer(ctx):
    admin, db, created = ctx["admin"], ctx["db"], ctx["created"]
    org_id = created["org_id"]

    editor_email = f"{_uid('TEST_RPT_EDITOR').lower()}@example.com"
    viewer_email = f"{_uid('TEST_RPT_VIEWER').lower()}@example.com"

    def register(email):
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": ADMIN_PASSWORD, "name": "Report User"}, timeout=30)
        assert r.status_code == 200, r.text
        user = r.json()["user"]
        created["users"].append(user)
        return user

    editor = register(editor_email)
    viewer = register(viewer_email)

    # Ensure viewer role explicitly
    patch = admin.patch(
        f"{BASE_URL}/api/auth/members/{viewer['id']}/role",
        headers={"x-organization-id": org_id, "Content-Type": "application/json"},
        json={"role": "viewer"},
        timeout=30,
    )
    assert patch.status_code == 200, patch.text

    for email in [editor_email, viewer_email]:
        s = requests.Session()
        login = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": ADMIN_PASSWORD}, timeout=30)
        assert login.status_code == 200, login.text
        r = s.get(f"{BASE_URL}/api/reports/events", headers={"x-organization-id": org_id}, timeout=30)
        assert r.status_code == 403, r.text
        assert "admins only" in r.json().get("error", "").lower()


# --- Event list scope behavior ---
def test_reports_events_scope_excludes_legacy_and_foreign(ctx):
    admin, db, created = ctx["admin"], ctx["db"], ctx["created"]
    org_id = created["org_id"]

    own_event = _create_event(admin, _uid("TEST_RPT_SCOPE_OWN"))
    created["events"].append(own_event["id"])

    foreign_org = {
        "id": str(uuid.uuid4()),
        "name": _uid("TEST_RPT_FOREIGN_ORG"),
        "slug": _uid("TEST_RPT_FOREIGN").lower(),
        "is_default": False,
        "plan": "free",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": created["users"][0]["id"] if created["users"] else "system"
    }
    db.organizations.insert_one(foreign_org)

    legacy_id = _uid("TEST_RPT_LEGACY_EVT")
    foreign_event_id = _uid("TEST_RPT_FOREIGN_EVT")
    legacy_res = db.events.insert_one({"id": legacy_id, "title": "Legacy No Org Event", "date": "2026-01-01"})
    foreign_res = db.events.insert_one({"id": foreign_event_id, "title": "Foreign Event", "organization_id": foreign_org["id"], "date": "2026-01-01"})
    created["event_object_ids"].extend([legacy_res.inserted_id, foreign_res.inserted_id])

    r = admin.get(f"{BASE_URL}/api/reports/events", headers={"x-organization-id": org_id}, timeout=30)
    assert r.status_code == 200, r.text
    events = r.json()["events"]
    ids = {e["id"] for e in events}
    assert own_event["id"] in ids
    assert legacy_id not in ids
    assert foreign_event_id not in ids


# --- Summary and event isolation ---
def test_event_summary_counts_and_scope_with_same_title_events(ctx):
    admin, db, created = ctx["admin"], ctx["db"], ctx["created"]
    org_id = created["org_id"]
    title = _uid("TEST_RPT_SAME_TITLE")
    event_a = _create_event(admin, title)
    event_b = _create_event(admin, title)
    created["events"].extend([event_a["id"], event_b["id"]])

    _insert_cert(db, cert_id=_uid("TEST_RPT_A1"), event_id=event_a["id"], status="Active")
    _insert_cert(db, cert_id=_uid("TEST_RPT_A2"), event_id=event_a["id"], status="active")
    _insert_cert(db, cert_id=_uid("TEST_RPT_A3"), event_id=event_a["id"], status="Revoked")
    _insert_cert(db, cert_id=_uid("TEST_RPT_A4"), event_id=event_a["id"], status="Unknown")
    _insert_cert(db, cert_id=_uid("TEST_RPT_B1"), event_id=event_b["id"], status="Active")

    r = admin.get(f"{BASE_URL}/api/reports/events/{event_a['id']}/summary", headers={"x-organization-id": org_id}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["event"]["id"] == event_a["id"]
    assert d["total"] == 4
    assert d["active"] == 2
    assert d["revoked"] == 1
    assert d["other"] == 1
    assert "certificates" not in d


# --- CSV/XLSX downloads and content correctness ---
def test_download_xlsx_has_valid_workbook_headers_and_no_cross_event_mix(ctx):
    admin, db, created = ctx["admin"], ctx["db"], ctx["created"]
    org_id = created["org_id"]
    title = _uid("TEST_RPT_BOOK")
    event_a = _create_event(admin, title)
    event_b = _create_event(admin, title)
    created["events"].extend([event_a["id"], event_b["id"]])

    cert_a = _uid("RPTOBJ_A")
    cert_b = _uid("RPTOBJ_B")
    _insert_cert(db, cert_id=cert_a, event_id=event_a["id"], status="Active", metadata={"team": "A"})
    _insert_cert(db, cert_id=cert_b, event_id=event_b["id"], status="Active", metadata={"team": "B"})

    r = admin.get(f"{BASE_URL}/api/reports/events/{event_a['id']}?format=xlsx", headers={"x-organization-id": org_id}, timeout=120)
    assert r.status_code == 200, r.text
    assert "spreadsheetml.sheet" in r.headers.get("content-type", "")
    assert "attachment;" in r.headers.get("content-disposition", "")
    assert "no-store" in (r.headers.get("cache-control") or "")
    assert r.headers.get("x-content-type-options") == "nosniff"

    wb = _xlsx_read(r.content)
    assert "Event Summary" in wb
    assert "Certificate Details" in wb
    header = wb["Certificate Details"][0]
    assert header[:9] == [
        "Certificate ID", "Event Name", "Event Date", "Recipient Name", "Recipient Email",
        "Issue Date", "Status", "Role", "Grade"
    ]
    all_cells = "\n".join(["|".join(["" if c is None else str(c) for c in row]) for row in wb["Certificate Details"]])
    assert cert_a in all_cells
    assert cert_b not in all_cells


def test_download_csv_escapes_specials_and_formula_injection(ctx):
    admin, db, created = ctx["admin"], ctx["db"], ctx["created"]
    org_id = created["org_id"]
    event = _create_event(admin, _uid("TEST_RPT_CSV"))
    created["events"].append(event["id"])

    _insert_cert(
        db,
        cert_id=_uid("TEST_RPT_CSVCERT"),
        event_id=event["id"],
        recipient_name='Name, "Quoted"\nNewline',
        recipient_email="ümlaut+测试@example.com",
        status=" Active ",
        metadata={
            "safe": "ok",
            "formula_trim": "   =2+3",
            "nested": {"child": "@SUM(A1:A2)"},
            "list": ["a", "b"],
            "nullv": None,
            "boolv": False,
            "zerov": 0,
        },
    )

    r = admin.get(f"{BASE_URL}/api/reports/events/{event['id']}?format=csv", headers={"x-organization-id": org_id}, timeout=60)
    assert r.status_code == 200, r.text
    assert r.headers.get("content-type", "").startswith("text/csv")
    assert "attachment;" in r.headers.get("content-disposition", "")
    assert "no-store" in (r.headers.get("cache-control") or "")

    rows = _get_rows_from_csv(r.content)
    assert len(rows) == 2
    hdr, row = rows[0], rows[1]
    assert "Certificate ID" in hdr
    rec_name = row[3]
    assert "Quoted" in rec_name and "Newline" in rec_name
    metadata_cells = [c for i, c in enumerate(row) if i >= 9]
    joined = "|".join(metadata_cells)
    assert "'   =2+3" in joined
    assert "'@SUM(A1:A2)" in joined


def test_metadata_cap_128_with_overflow_json(ctx):
    admin, db, created = ctx["admin"], ctx["db"], ctx["created"]
    org_id = created["org_id"]
    event = _create_event(admin, _uid("TEST_RPT_META"))
    created["events"].append(event["id"])

    metadata = {f"k{i:03d}": f"v{i}" for i in range(130)}
    _insert_cert(db, cert_id=_uid("RPTMETA"), event_id=event["id"], metadata=metadata)

    r = admin.get(f"{BASE_URL}/api/reports/events/{event['id']}?format=csv", headers={"x-organization-id": org_id}, timeout=60)
    assert r.status_code == 200, r.text
    rows = _get_rows_from_csv(r.content)
    hdr, row = rows[0], rows[1]
    metadata_headers = [h for h in hdr if h.startswith("Metadata: ")]
    assert len(metadata_headers) == 128
    overflow = row[hdr.index("Metadata")]
    assert overflow.startswith("{") and "k129" in overflow


def test_oversized_cell_returns_422_without_stack_trace(ctx):
    admin, db, created = ctx["admin"], ctx["db"], ctx["created"]
    org_id = created["org_id"]
    event = _create_event(admin, _uid("TEST_RPT_HUGE"))
    created["events"].append(event["id"])
    _insert_cert(db, cert_id=_uid("RPTHUGE"), event_id=event["id"], metadata={"huge": "x" * 33000})

    r = admin.get(f"{BASE_URL}/api/reports/events/{event['id']}?format=xlsx", headers={"x-organization-id": org_id}, timeout=60)
    assert r.status_code == 422
    body = r.json()
    assert "32,767" in body.get("error", "")
    assert "stack" not in json.dumps(body).lower()


# --- ID/input validation and error semantics ---
def test_invalid_event_id_and_object_injection_path(ctx):
    admin, created = ctx["admin"], ctx["created"]
    org_id = created["org_id"]
    for bad in ["$ne", "{}", "bad/id"]:
        r = admin.get(f"{BASE_URL}/api/reports/events/{bad}/summary", headers={"x-organization-id": org_id}, timeout=30)
        assert r.status_code in (400, 404)

    encoded = "%7B%22$ne%22:%22x%22%7D"
    r2 = admin.get(f"{BASE_URL}/api/reports/events/{encoded}/summary", headers={"x-organization-id": org_id}, timeout=30)
    assert r2.status_code == 400


def test_nonexistent_foreign_unassigned_events_return_404(ctx):
    admin, db, created = ctx["admin"], ctx["db"], ctx["created"]
    org_id = created["org_id"]
    missing = _uid("TEST_RPT_MISSING")
    r_missing = admin.get(f"{BASE_URL}/api/reports/events/{missing}/summary", headers={"x-organization-id": org_id}, timeout=30)
    assert r_missing.status_code == 404

    foreign_org_id = str(uuid.uuid4())
    db.organizations.insert_one({"id": foreign_org_id, "name": _uid("TEST_RPT_FOREIGN_"), "slug": _uid("rptslug").lower(), "created_at": datetime.now(timezone.utc).isoformat()})
    foreign_event_id = _uid("TEST_RPT_FOREIGN404")
    foreign_insert = db.events.insert_one({"id": foreign_event_id, "title": "x", "organization_id": foreign_org_id})
    unassigned_id = _uid("TEST_RPT_UNASSIGNED")
    unassigned_insert = db.events.insert_one({"id": unassigned_id, "title": "x"})
    created["event_object_ids"].extend([foreign_insert.inserted_id, unassigned_insert.inserted_id])

    r_foreign = admin.get(f"{BASE_URL}/api/reports/events/{foreign_event_id}/summary", headers={"x-organization-id": org_id}, timeout=30)
    r_unassigned = admin.get(f"{BASE_URL}/api/reports/events/{unassigned_id}/summary", headers={"x-organization-id": org_id}, timeout=30)
    assert r_foreign.status_code == 404
    assert r_unassigned.status_code == 404


def test_invalid_format_and_array_format_handling(ctx):
    admin, created = ctx["admin"], ctx["created"]
    org_id = created["org_id"]
    event = _create_event(admin, _uid("TEST_RPT_FORMAT"))
    created["events"].append(event["id"])
    r1 = admin.get(f"{BASE_URL}/api/reports/events/{event['id']}?format=pdf", headers={"x-organization-id": org_id}, timeout=30)
    assert r1.status_code == 400
    r2 = admin.get(f"{BASE_URL}/api/reports/events/{event['id']}?format=xlsx&format=csv", headers={"x-organization-id": org_id}, timeout=30)
    assert r2.status_code in (200, 400)


def test_empty_event_summary_and_download_422(ctx):
    admin, created = ctx["admin"], ctx["created"]
    org_id = created["org_id"]
    event = _create_event(admin, _uid("TEST_RPT_EMPTY"))
    created["events"].append(event["id"])

    s = admin.get(f"{BASE_URL}/api/reports/events/{event['id']}/summary", headers={"x-organization-id": org_id}, timeout=30)
    assert s.status_code == 200
    d = s.json()
    assert d["total"] == 0 and d["active"] == 0 and d["revoked"] == 0

    dl = admin.get(f"{BASE_URL}/api/reports/events/{event['id']}?format=csv", headers={"x-organization-id": org_id}, timeout=30)
    assert dl.status_code == 422


# --- Relationship types and large event behavior ---
def test_uuid_and_native_objectid_event_relationships_are_included(ctx):
    admin, db, created = ctx["admin"], ctx["db"], ctx["created"]
    org_id = created["org_id"]
    event = _create_event(admin, _uid("TEST_RPT_OBJREL"))
    created["events"].append(event["id"])
    event_doc = db.events.find_one({"id": event["id"]})

    _insert_cert(db, cert_id=_uid("RPTOBJ_UUID"), event_id=event["id"], status="Active")
    _insert_cert(db, cert_id=_uid("RPTOBJ_OBJ"), event_id=event_doc["_id"], status="Active")
    _insert_cert(db, cert_id=_uid("RPTOBJ_STR"), event_id=str(event_doc["_id"]), status="Revoked")

    s = admin.get(f"{BASE_URL}/api/reports/events/{event['id']}/summary", headers={"x-organization-id": org_id}, timeout=30)
    assert s.status_code == 200
    d = s.json()
    assert d["total"] == 3 and d["active"] == 2 and d["revoked"] == 1


def test_large_event_5000_rows_and_index_presence(ctx):
    admin, db, created = ctx["admin"], ctx["db"], ctx["created"]
    org_id = created["org_id"]
    event = _create_event(admin, _uid("TEST_RPT_LARGE"))
    created["events"].append(event["id"])

    rows = []
    for i in range(5000):
        rows.append({
            "cert_id": f"RPTLARGE_{i:05d}",
            "event_id": event["id"],
            "recipient_name": f"User {i}",
            "recipient_email": f"u{i}@example.com",
            "issue_date": "2026-02-10",
            "status": "Active" if i % 2 == 0 else "Revoked",
            "metadata": {"batch": "L"},
            "role": "Participant",
            "grade": "Pass",
        })
    db.certificates.insert_many(rows, ordered=False)

    unrelated = [{
        "cert_id": f"TEST_RPT_UNRELATED_{i}",
        "event_id": _uid("UNRELATED_EVT"),
        "recipient_name": "Other",
        "recipient_email": "other@example.com",
        "issue_date": "2026-02-10",
        "status": "Active",
    } for i in range(30)]
    db.certificates.insert_many(unrelated, ordered=False)

    s = admin.get(f"{BASE_URL}/api/reports/events/{event['id']}/summary", headers={"x-organization-id": org_id}, timeout=120)
    assert s.status_code == 200
    d = s.json()
    assert d["total"] == 5000

    csv_dl = admin.get(f"{BASE_URL}/api/reports/events/{event['id']}?format=csv", headers={"x-organization-id": org_id}, timeout=180)
    assert csv_dl.status_code == 200, csv_dl.text[:200]
    rows = _get_rows_from_csv(csv_dl.content)
    assert len(rows) == 5001  # header + 5000
    cert_ids = {r[0] for r in rows[1:]}
    assert "TEST_RPT_UNRELATED_1" not in cert_ids
    assert "RPTLARGE_00001" in cert_ids

    xlsx_dl = admin.get(f"{BASE_URL}/api/reports/events/{event['id']}?format=xlsx", headers={"x-organization-id": org_id}, timeout=180)
    assert xlsx_dl.status_code == 200
    wb = _xlsx_read(xlsx_dl.content)
    assert len(wb["Certificate Details"]) == 5001

    explain = db.command({
        "explain": {
            "find": "certificates",
            "filter": {"event_id": event["id"]},
            "sort": {"cert_id": 1}
        }
    })
    plan_text = json.dumps(explain)
    assert "event_id_1_cert_id_1" in plan_text
