"""Resend integration + event completion delivery tests (certificate + report emails)."""
import io
import os
import time
import uuid
from pathlib import Path

import pytest
import requests
from pymongo import MongoClient


def _read_env(path: Path):
    values = {}
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        values[key.strip()] = val.strip()
    return values


ROOT = Path(__file__).resolve().parents[2]
FRONT_ENV = _read_env(ROOT / "frontend" / ".env")
BACK_ENV = _read_env(ROOT / "backend" / ".env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or FRONT_ENV.get("REACT_APP_BACKEND_URL")
MONGO_URL = os.environ.get("MONGO_URL") or BACK_ENV.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or BACK_ENV.get("DB_NAME")

ADMIN_EMAIL = os.environ.get("REPORT_TEST_ADMIN_EMAIL") or BACK_ENV.get("REPORT_TEST_ADMIN_EMAIL")
ADMIN_PASSWORD = os.environ.get("REPORT_TEST_ADMIN_PASSWORD") or BACK_ENV.get("REPORT_TEST_ADMIN_PASSWORD")
TEST_RECIPIENT = BACK_ENV.get("RESEND_TEST_RECIPIENT")
RESEND_KEY = BACK_ENV.get("RESEND_API_KEY", "")


def _uid(prefix="TEST_RESEND"):
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


def _event_by_id(events, event_id):
    for event in events:
        if event.get("id") == event_id:
            return event
    return None


@pytest.fixture(scope="module")
def ctx():
    # Config + sessions
    if not BASE_URL:
        pytest.fail("REACT_APP_BACKEND_URL is required")
    if not MONGO_URL or not DB_NAME:
        pytest.fail("MONGO_URL and DB_NAME are required")
    if not ADMIN_EMAIL or not ADMIN_PASSWORD:
        pytest.fail("Admin test credentials are required")

    db = MongoClient(MONGO_URL)[DB_NAME]
    admin = requests.Session()

    login = admin.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    if login.status_code != 200:
        pytest.fail(f"Admin login failed: {login.status_code} {login.text}")

    me = admin.get(f"{BASE_URL}/api/auth/me", timeout=30)
    if me.status_code != 200:
        pytest.fail(f"/api/auth/me failed: {me.status_code} {me.text}")
    org_id = me.json()["active_membership"]["organization_id"]

    templates = admin.get(
        f"{BASE_URL}/api/templates",
        headers={"x-organization-id": org_id},
        timeout=30,
    )
    if templates.status_code != 200 or not templates.json():
        pytest.fail("No template available for resend integration tests")

    created = {
        "org_id": org_id,
        "template_id": templates.json()[0]["id"],
        "events": [],
        "users": [],
        "bulk_job_ids": [],
        "bulk_upload_ids": [],
        "cert_ids": [],
        "event_complete_id": None,
        "event_complete_delivery": None,
    }

    yield {"admin": admin, "db": db, "created": created}

    # Cleanup: test users + memberships
    if created["users"]:
        user_ids = [u["id"] for u in created["users"]]
        db.organization_memberships.delete_many({"user_id": {"$in": user_ids}})
        db.users.delete_many({"id": {"$in": user_ids}})

    # Cleanup created events
    for event_id in created["events"]:
        admin.delete(
            f"{BASE_URL}/api/events/{event_id}",
            headers={"x-organization-id": created["org_id"]},
            timeout=30,
        )

    # Cleanup test artifacts in collections
    db.certificates.delete_many({"cert_id": {"$regex": "^TEST_RESEND_"}})
    db.bulk_records.delete_many({"job_id": {"$regex": "^BG-"}, "certificate_id": {"$regex": "^CERT-"}})
    if created["bulk_job_ids"]:
        db.bulk_jobs.delete_many({"id": {"$in": created["bulk_job_ids"]}})
    if created["bulk_upload_ids"]:
        db.bulk_uploads.delete_many({"id": {"$in": created["bulk_upload_ids"]}})


def _create_event(admin, org_id, title):
    payload = {
        "title": title,
        "category": "Workshop",
        "date": "2026-02-20",
        "organizer": "QA Team",
        "location": "Test Hall",
        "description": "Resend integration test",
    }
    res = admin.post(
        f"{BASE_URL}/api/events",
        headers={"x-organization-id": org_id},
        json=payload,
        timeout=30,
    )
    assert res.status_code == 200, res.text
    return res.json()["event"]


def _register_user(email, password="Reports!2026Safe"):
    s = requests.Session()
    res = s.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": password, "name": "Resend QA User"},
        timeout=30,
    )
    assert res.status_code == 200, res.text
    data = res.json()
    return s, data["user"]


def _poll_job(admin, job_id, max_wait=60):
    deadline = time.time() + max_wait
    last = None
    while time.time() < deadline:
        last = admin.get(f"{BASE_URL}/api/bulk/jobs/{job_id}", timeout=30)
        assert last.status_code == 200, last.text
        job = last.json()
        if job["status"] in {"completed", "completed_with_errors", "failed", "cancelled"}:
            return job
        time.sleep(1.5)
    pytest.fail(f"Timed out waiting for job completion: {job_id}; last={last.text if last else 'n/a'}")


def _poll_event_delivery(admin, org_id, event_id, timeout_sec=70):
    deadline = time.time() + timeout_sec
    last = None
    while time.time() < deadline:
        res = admin.get(f"{BASE_URL}/api/events", headers={"x-organization-id": org_id}, timeout=30)
        assert res.status_code == 200, res.text
        event = _event_by_id(res.json(), event_id)
        if event:
            last = event
            status = (event.get("report_delivery") or {}).get("status")
            if status in {"sent", "failed"}:
                return event
        time.sleep(2)
    pytest.fail(f"Timed out waiting for event report delivery status. last={last}")


# Auth + event list baseline
def test_admin_auth_and_events_list(ctx):
    admin, created = ctx["admin"], ctx["created"]
    res = admin.get(f"{BASE_URL}/api/events", headers={"x-organization-id": created["org_id"]}, timeout=30)
    assert res.status_code == 200
    assert isinstance(res.json(), list)


# Certificate delivery through simple bulk generator
def test_generate_bulk_certificate_persists_resend_delivery_fields(ctx):
    admin, created = ctx["admin"], ctx["created"]
    event = _create_event(admin, created["org_id"], _uid("TEST_RESEND_SIMPLE_EVT"))
    created["events"].append(event["id"])

    intended_email = f"{_uid('student').lower()}@example.com"
    payload = {
        "event_id": event["id"],
        "template_id": created["template_id"],
        "participants": [
            {
                "name": _uid("TEST_RESEND_STUDENT"),
                "email": intended_email,
                "role": "Participant",
                "grade": "Pass",
            }
        ],
        "issue_date": "2026-02-21",
    }
    res = admin.post(
        f"{BASE_URL}/api/certificates/generate-bulk",
        headers={"x-organization-id": created["org_id"]},
        json=payload,
        timeout=120,
    )
    assert res.status_code == 200, res.text
    cert = res.json()["certificates"][0]
    created["cert_ids"].append(cert["cert_id"])

    assert cert["recipient_email"] == intended_email
    assert cert["email_status"] == "sent"
    assert cert["sent_email"] is True
    assert cert.get("email_id")
    assert cert.get("email_actual_recipient") == TEST_RECIPIENT

    persisted = admin.get(
        f"{BASE_URL}/api/certificates/{cert['cert_id']}",
        headers={"x-organization-id": created["org_id"]},
        timeout=30,
    )
    assert persisted.status_code == 200
    p = persisted.json()
    assert p["recipient_email"] == intended_email
    assert p["email_status"] == "sent"
    assert p["sent_email"] is True
    assert p.get("email_id")
    assert p.get("email_actual_recipient") == TEST_RECIPIENT


# Smart Bulk Studio job integration + resend acceptance persistence
def test_smart_bulk_job_links_event_and_stores_delivery_ids(ctx):
    admin, created = ctx["admin"], ctx["created"]
    event = _create_event(admin, created["org_id"], _uid("TEST_RESEND_STUDIO_EVT"))
    created["events"].append(event["id"])

    csv_bytes = (
        "Full Name,Email,Event\n"
        f"{_uid('TEST_RESEND_BULK_USER')},{_uid('bulk').lower()}@example.com,{event['title']}\n"
    ).encode("utf-8")
    files = {"file": ("test_resend_bulk.csv", io.BytesIO(csv_bytes), "text/csv")}
    upload = admin.post(
        f"{BASE_URL}/api/bulk/upload",
        headers={"x-organization-id": created["org_id"]},
        files=files,
        timeout=60,
    )
    assert upload.status_code == 200, upload.text
    upload_id = upload.json()["upload_id"]
    created["bulk_upload_ids"].append(upload_id)

    suggest = admin.post(
        f"{BASE_URL}/api/bulk/uploads/{upload_id}/suggest-mapping",
        headers={"x-organization-id": created["org_id"]},
        json={"template_id": created["template_id"]},
        timeout=30,
    )
    assert suggest.status_code == 200, suggest.text
    suggestions = suggest.json()["auto_suggestions"]
    mapping = {}
    for header, match in suggestions.items():
        field = match.get("fieldType") if isinstance(match, dict) else match
        if field:
            mapping[header] = field
    assert "recipient_name" in mapping.values()
    assert "email" in mapping.values()

    job_create = admin.post(
        f"{BASE_URL}/api/bulk/jobs",
        headers={"x-organization-id": created["org_id"]},
        json={
            "upload_id": upload_id,
            "template_id": created["template_id"],
            "event_id": event["id"],
            "mapping": mapping,
            "defaults": {"event_title": event["title"]},
            "settings": {"email_enabled": True, "zip_enabled": True},
        },
        timeout=60,
    )
    assert job_create.status_code == 200, job_create.text
    job_id = job_create.json()["job_id"]
    created["bulk_job_ids"].append(job_id)

    job = _poll_job(admin, job_id)
    assert job["event_id"] == event["id"]
    assert job["successful_records"] >= 1

    records = admin.get(
        f"{BASE_URL}/api/bulk/jobs/{job_id}/records",
        headers={"x-organization-id": created["org_id"]},
        timeout=30,
    )
    assert records.status_code == 200, records.text
    success = [r for r in records.json()["rows"] if r.get("status") == "success"]
    assert success
    row = success[0]
    cert_id = row["certificate_id"]
    created["cert_ids"].append(cert_id)
    assert row.get("email_status") == "sent"
    assert row.get("email_id")

    cert = admin.get(
        f"{BASE_URL}/api/certificates/{cert_id}",
        headers={"x-organization-id": created["org_id"]},
        timeout=30,
    )
    assert cert.status_code == 200
    cert_body = cert.json()
    assert cert_body["sent_email"] is True
    assert cert_body["email_status"] == "sent"
    assert cert_body.get("email_id")
    assert cert_body.get("email_actual_recipient") == TEST_RECIPIENT


# Failed-email resend should not mark sent when provider acceptance does not happen
def test_resend_failed_endpoint_does_not_false_positive_sent(ctx):
    admin, db, created = ctx["admin"], ctx["db"], ctx["created"]
    if not created["bulk_job_ids"]:
        pytest.skip("No bulk job available from prior test")

    job_id = created["bulk_job_ids"][-1]
    row = db.bulk_records.find_one({"job_id": job_id, "status": "success"})
    if not row:
        pytest.skip("No successful bulk record found")

    cert_id = row["certificate_id"]
    db.bulk_records.update_one(
        {"_id": row["_id"]},
        {"$set": {"email_status": "failed", "pdf_path": "/tmp/missing-test-resend.pdf"}},
    )
    db.certificates.update_one(
        {"cert_id": cert_id},
        {"$set": {"sent_email": False, "email_status": "failed", "email_id": None}},
    )

    resend = admin.post(
        f"{BASE_URL}/api/bulk/jobs/{job_id}/resend-emails",
        headers={"x-organization-id": created["org_id"]},
        timeout=60,
    )
    assert resend.status_code == 200, resend.text
    data = resend.json()
    assert data["failed"] >= 1

    cert = admin.get(
        f"{BASE_URL}/api/certificates/{cert_id}",
        headers={"x-organization-id": created["org_id"]},
        timeout=30,
    )
    assert cert.status_code == 200
    assert cert.json().get("sent_email") is False
    assert cert.json().get("email_status") != "sent"


# Event completion report delivery workflow
def test_complete_event_queues_and_sends_xlsx_csv_to_admins(ctx):
    admin, created = ctx["admin"], ctx["created"]
    event = _create_event(admin, created["org_id"], _uid("TEST_RESEND_COMPLETE_EVT"))
    created["events"].append(event["id"])

    cert_payload = {
        "event_id": event["id"],
        "template_id": created["template_id"],
        "participants": [
            {
                "name": _uid("TEST_RESEND_REPORT_USER"),
                "email": f"{_uid('report').lower()}@example.com",
                "role": "Participant",
                "grade": "A",
            }
        ],
    }
    cert_issue = admin.post(
        f"{BASE_URL}/api/certificates/generate-bulk",
        headers={"x-organization-id": created["org_id"]},
        json=cert_payload,
        timeout=120,
    )
    assert cert_issue.status_code == 200, cert_issue.text

    complete = admin.post(
        f"{BASE_URL}/api/events/{event['id']}/complete",
        headers={"x-organization-id": created["org_id"]},
        timeout=30,
    )
    assert complete.status_code == 202, complete.text
    assert complete.json()["event"]["status"] == "completed"
    assert complete.json()["event"]["report_delivery"]["status"] in {"queued", "processing"}

    delivered_event = _poll_event_delivery(admin, created["org_id"], event["id"])
    created["event_complete_id"] = event["id"]
    created["event_complete_delivery"] = delivered_event.get("report_delivery")
    assert delivered_event["report_delivery"]["status"] == "sent"

    recipients = delivered_event["report_delivery"].get("recipients") or []
    assert recipients
    for item in recipients:
        assert item.get("intended_email")
        assert item.get("actual_email") == TEST_RECIPIENT
        assert item.get("status") == "sent"
        assert item.get("email_id")


# Idempotent completion: no duplicate queue/send
def test_complete_event_idempotent_no_duplicate_report_delivery(ctx):
    admin, created = ctx["admin"], ctx["created"]
    if not created["event_complete_id"]:
        pytest.skip("No completed event available from prior test")

    event_id = created["event_complete_id"]
    before = created["event_complete_delivery"] or {}
    before_ids = sorted((r.get("email_id") for r in before.get("recipients", []) if r.get("email_id")))

    again = admin.post(
        f"{BASE_URL}/api/events/{event_id}/complete",
        headers={"x-organization-id": created["org_id"]},
        timeout=30,
    )
    assert again.status_code == 200, again.text
    assert "already completed" in again.json().get("message", "").lower()

    time.sleep(4)
    events = admin.get(f"{BASE_URL}/api/events", headers={"x-organization-id": created["org_id"]}, timeout=30)
    assert events.status_code == 200
    current = _event_by_id(events.json(), event_id)
    assert current
    after_delivery = current.get("report_delivery") or {}
    after_ids = sorted((r.get("email_id") for r in (after_delivery.get("recipients") or []) if r.get("email_id")))
    assert before_ids == after_ids


# Retry API should only queue failed deliveries
def test_retry_endpoint_rejects_non_failed_event_delivery(ctx):
    admin, created = ctx["admin"], ctx["created"]
    if not created["event_complete_id"]:
        pytest.skip("No completed event available from prior test")

    events = admin.get(f"{BASE_URL}/api/events", headers={"x-organization-id": created["org_id"]}, timeout=30)
    assert events.status_code == 200
    current = _event_by_id(events.json(), created["event_complete_id"])
    assert current
    status = (current.get("report_delivery") or {}).get("status")

    retry = admin.post(
        f"{BASE_URL}/api/events/{created['event_complete_id']}/report-delivery/retry",
        headers={"x-organization-id": created["org_id"]},
        timeout=30,
    )
    if status == "failed":
        assert retry.status_code == 202
        assert "queued" in retry.json().get("message", "").lower()
    else:
        assert retry.status_code == 409
        assert "failed" in retry.json().get("error", "").lower()


# RBAC: only admin/super_admin can complete events
def test_only_admin_or_super_admin_can_complete_events(ctx):
    admin, created = ctx["admin"], ctx["created"]
    event = _create_event(admin, created["org_id"], _uid("TEST_RESEND_RBAC_EVT"))
    created["events"].append(event["id"])

    editor_email = f"{_uid('editor').lower()}@example.com"
    viewer_email = f"{_uid('viewer').lower()}@example.com"
    editor_session, editor_user = _register_user(editor_email)
    viewer_session, viewer_user = _register_user(viewer_email)
    created["users"].extend([editor_user, viewer_user])

    role_patch = admin.patch(
        f"{BASE_URL}/api/auth/members/{viewer_user['id']}/role",
        headers={"x-organization-id": created["org_id"], "Content-Type": "application/json"},
        json={"role": "viewer"},
        timeout=30,
    )
    assert role_patch.status_code == 200, role_patch.text

    for session in (editor_session, viewer_session):
        blocked = session.post(
            f"{BASE_URL}/api/events/{event['id']}/complete",
            headers={"x-organization-id": created["org_id"]},
            timeout=30,
        )
        assert blocked.status_code == 403
        err = blocked.json().get("error", "").lower()
        assert "only organization admins" in err or "permission denied" in err


# Regression endpoints + key leak safety
def test_reports_downloads_pdf_regression_and_no_api_key_exposure(ctx):
    admin, created = ctx["admin"], ctx["created"]
    if not created["event_complete_id"] or not created["cert_ids"]:
        pytest.skip("Need completed event and at least one certificate from prior tests")

    event_id = created["event_complete_id"]
    cert_id = created["cert_ids"][0]
    headers = {"x-organization-id": created["org_id"]}

    responses = []
    ev = admin.get(f"{BASE_URL}/api/reports/events", headers=headers, timeout=30)
    assert ev.status_code == 200, ev.text
    responses.append(ev.text)

    summary = admin.get(f"{BASE_URL}/api/reports/events/{event_id}/summary", headers=headers, timeout=30)
    assert summary.status_code == 200, summary.text
    responses.append(summary.text)

    csv_dl = admin.get(f"{BASE_URL}/api/reports/events/{event_id}?format=csv", headers=headers, timeout=60)
    assert csv_dl.status_code == 200, csv_dl.text
    responses.append(csv_dl.text)

    xlsx_dl = admin.get(f"{BASE_URL}/api/reports/events/{event_id}?format=xlsx", headers=headers, timeout=60)
    assert xlsx_dl.status_code == 200
    assert xlsx_dl.content[:2] == b"PK"

    cert_pdf = admin.get(f"{BASE_URL}/api/certificates/{cert_id}/download-pdf", headers=headers, timeout=60)
    assert cert_pdf.status_code == 200
    assert cert_pdf.content[:4] == b"%PDF"

    me = admin.get(f"{BASE_URL}/api/auth/me", timeout=30)
    assert me.status_code == 200
    responses.append(me.text)

    if RESEND_KEY:
        for body in responses:
            assert RESEND_KEY not in body
    for body in responses:
        assert "RESEND_API_KEY" not in body
