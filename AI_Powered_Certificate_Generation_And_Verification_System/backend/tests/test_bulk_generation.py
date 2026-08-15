"""Backend API tests for Smart Bulk Certificate Generation module."""
import io
import os
import time
import zipfile
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://full-stack-web-19.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"
BULK = f"{API}/bulk"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


# Shared state across tests
state = {}


def _extract_mapping(sugg):
    """Convert suggest-mapping response into {header: field_type}."""
    m = {}
    if isinstance(sugg, dict):
        for h, v in sugg.items():
            if isinstance(v, dict):
                f = v.get("fieldType") or v.get("field") or v.get("target")
            else:
                f = v
            if f:
                m[h] = f
    elif isinstance(sugg, list):
        for item in sugg:
            f = item.get("fieldType") or item.get("field") or item.get("target")
            if f:
                m[item.get("header")] = f
    return m


# --- Regression: existing endpoints still work ---
def test_regression_analytics(s):
    r = s.get(f"{API}/analytics")
    assert r.status_code == 200
    assert "total_certificates" in r.json()


def test_regression_templates(s):
    r = s.get(f"{API}/templates")
    assert r.status_code == 200
    tpls = r.json()
    assert isinstance(tpls, list) and len(tpls) >= 1
    state["template_id"] = tpls[0]["id"]


def test_regression_events(s):
    r = s.get(f"{API}/events")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_regression_certificates(s):
    r = s.get(f"{API}/certificates")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# --- Bulk config & sample templates ---
def test_bulk_limits(s):
    r = s.get(f"{BULK}/limits")
    assert r.status_code == 200
    d = r.json()
    assert d["max_file_size"] > 0 and d["max_rows"] > 0
    assert "csv" in d["supported_formats"]


def test_sample_template_csv(s):
    r = s.get(f"{BULK}/sample-template?format=csv")
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("text/csv")
    assert len(r.content) > 0
    assert b"Full Name" in r.content


def test_sample_template_xlsx(s):
    r = s.get(f"{BULK}/sample-template?format=xlsx")
    assert r.status_code == 200
    ct = r.headers.get("content-type", "")
    assert "spreadsheet" in ct or "xlsx" in ct
    # xlsx starts with PK zip magic
    assert r.content[:2] == b"PK"


# --- Upload validation ---
def test_upload_valid_csv(s):
    csv_data = (
        "Full Name,Email,Event,Department,Rank,Score,Issue Date\n"
        "TEST Alice,alice@test.com,AI Workshop,CSE,First,95,2026-01-10\n"
        "TEST Bob,bob@test.com,AI Workshop,CSE,Second,88,2026-01-10\n"
        "TEST Carol,carol@test.com,AI Workshop,IT,Third,75,2026-01-10\n"
    )
    files = {"file": ("test.csv", csv_data, "text/csv")}
    r = s.post(f"{BULK}/upload", files=files)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "upload_id" in d
    assert d["row_count"] == 3
    assert "Full Name" in d["headers"]
    assert len(d["preview"]) == 3
    state["upload_id"] = d["upload_id"]


def test_upload_reject_txt(s):
    files = {"file": ("evil.txt", "hello", "text/plain")}
    r = s.post(f"{BULK}/upload", files=files)
    assert r.status_code == 400


def test_upload_reject_large(s):
    # Create > 10MB file
    big = b"a,b,c\n" + b"x,y,z\n" * 2_000_000  # ~12MB
    files = {"file": ("big.csv", big, "text/csv")}
    r = s.post(f"{BULK}/upload", files=files)
    assert r.status_code == 400


def test_upload_formula_neutralised(s):
    csv_data = (
        "Full Name,Email,Event\n"
        "=SUM(A1:A2),evil@test.com,Hack\n"
        "@cmd,ok@test.com,Ev\n"
    )
    files = {"file": ("formula.csv", csv_data, "text/csv")}
    r = s.post(f"{BULK}/upload", files=files)
    assert r.status_code == 200
    preview = r.json()["preview"]
    # cells starting with = or @ should be prefixed with '
    v0 = preview[0]["Full Name"]
    v1 = preview[1]["Full Name"]
    assert v0.startswith("'"), f"Formula not neutralised: {v0!r}"
    assert v1.startswith("'"), f"Formula not neutralised: {v1!r}"


# --- Suggest mapping ---
def test_suggest_mapping(s):
    uid = state["upload_id"]
    r = s.post(f"{BULK}/uploads/{uid}/suggest-mapping", json={})
    assert r.status_code == 200
    d = r.json()
    assert "auto_suggestions" in d
    sugg = d["auto_suggestions"]
    # Common headers should map with confidence >= 60
    # Structure: {header: {field, confidence}} OR list; be flexible
    # Just verify recipient_name and email got suggested for something
    mapping = _extract_mapping(sugg)
    all_fields = list(mapping.values())
    assert "recipient_name" in all_fields, f"recipient_name not suggested: {sugg}"
    assert "email" in all_fields
    state["mapping"] = mapping


# --- Validate ---
def test_validate_good_mapping(s):
    uid = state["upload_id"]
    r = s.post(f"{BULK}/uploads/{uid}/validate",
               json={"mapping": state["mapping"], "defaults": {}})
    assert r.status_code == 200
    summary = r.json().get("summary", {})
    assert summary.get("total") == 3
    assert summary.get("valid", 0) >= 3 or summary.get("invalid", 0) == 0
    state["summary"] = summary


def test_validate_missing_recipient(s):
    uid = state["upload_id"]
    # Remove recipient_name mapping
    bad = {k: v for k, v in state["mapping"].items() if v != "recipient_name"}
    r = s.post(f"{BULK}/uploads/{uid}/validate", json={"mapping": bad, "defaults": {}})
    assert r.status_code == 200
    summary = r.json()["summary"]
    assert summary["invalid"] == summary["total"], f"Expected all invalid, got {summary}"


def test_duplicate_detection(s):
    csv_data = (
        "Full Name,Email,Event\n"
        "TEST Dup,dup@test.com,Same Event\n"
        "TEST Dup,dup@test.com,Same Event\n"
        "TEST Other,other@test.com,Same Event\n"
    )
    files = {"file": ("dup.csv", csv_data, "text/csv")}
    r = s.post(f"{BULK}/upload", files=files)
    assert r.status_code == 200
    uid = r.json()["upload_id"]
    sugg = s.post(f"{BULK}/uploads/{uid}/suggest-mapping", json={}).json()["auto_suggestions"]
    mapping = _extract_mapping(sugg)
    r2 = s.post(f"{BULK}/uploads/{uid}/validate", json={"mapping": mapping})
    summary = r2.json()["summary"]
    assert summary["duplicate"] >= 1, f"Expected duplicate>=1, got {summary}"


def test_errors_csv(s):
    uid = state["upload_id"]
    # First run a validation with bad mapping to produce errors
    bad = {k: v for k, v in state["mapping"].items() if v != "recipient_name"}
    s.post(f"{BULK}/uploads/{uid}/validate", json={"mapping": bad})
    r = s.get(f"{BULK}/uploads/{uid}/errors.csv")
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("text/csv")
    # Restore good validation
    s.post(f"{BULK}/uploads/{uid}/validate", json={"mapping": state["mapping"]})


# --- Saved mappings ---
def test_saved_mappings_crud(s):
    r = s.post(f"{BULK}/saved-mappings",
               json={"name": "TEST_Mapping", "mapping": state["mapping"], "defaults": {}})
    assert r.status_code == 200
    saved_id = r.json()["mapping"]["id"]
    r2 = s.get(f"{BULK}/saved-mappings")
    assert r2.status_code == 200
    assert any(m["id"] == saved_id for m in r2.json())
    r3 = s.delete(f"{BULK}/saved-mappings/{saved_id}")
    assert r3.status_code == 200


# --- Sample preview PDF ---
def test_sample_preview_pdf(s):
    r = s.post(f"{BULK}/preview-sample", json={
        "upload_id": state["upload_id"],
        "template_id": state["template_id"],
        "mapping": state["mapping"],
        "row_index": 0
    })
    assert r.status_code == 200, r.text
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert r.content[:4] == b"%PDF"


# --- Job lifecycle ---
def test_create_job_and_wait(s):
    r = s.post(f"{BULK}/jobs", json={
        "upload_id": state["upload_id"],
        "template_id": state["template_id"],
        "mapping": state["mapping"],
        "defaults": {},
        "settings": {"email_enabled": True, "zip_enabled": True}
    })
    assert r.status_code == 200, r.text
    job_id = r.json()["job_id"]
    state["job_id"] = job_id

    # Poll
    for _ in range(30):
        j = s.get(f"{BULK}/jobs/{job_id}").json()
        if j["status"] in ("completed", "completed_with_errors", "failed", "cancelled"):
            break
        time.sleep(1)
    assert j["status"] in ("completed", "completed_with_errors"), f"Job status: {j['status']}"
    assert j["successful_records"] >= 3, f"successful={j['successful_records']}"


def test_job_records(s):
    r = s.get(f"{BULK}/jobs/{state['job_id']}/records")
    assert r.status_code == 200
    rows = r.json()["rows"]
    assert len(rows) >= 3
    success_rows = [x for x in rows if x["status"] == "success"]
    assert all(x["certificate_id"] and x["pdf_path"] for x in success_rows)
    ids = [x["certificate_id"] for x in success_rows]
    assert len(ids) == len(set(ids)), "Certificate IDs are not unique"
    state["cert_ids"] = ids


def test_job_zip_download(s):
    r = s.get(f"{BULK}/jobs/{state['job_id']}/download")
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("application/zip")
    assert len(r.content) > 1024, f"zip too small: {len(r.content)}"
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    names = zf.namelist()
    assert any(n.endswith(".pdf") for n in names)
    assert "summary.csv" in names


def test_bulk_certs_appear_in_existing_certificates(s):
    r = s.get(f"{API}/certificates")
    assert r.status_code == 200
    existing = {c["cert_id"] for c in r.json()}
    # At least one of our bulk-generated cert IDs should be in the main collection
    found = [cid for cid in state["cert_ids"] if cid in existing]
    assert len(found) >= 1, f"None of bulk certs {state['cert_ids']} in main /certificates"
    state["one_cert_id"] = found[0]


def test_existing_pdf_download_of_bulk_cert(s):
    cid = state["one_cert_id"]
    r = s.get(f"{API}/certificates/{cid}/download-pdf")
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert r.content[:4] == b"%PDF"


def test_resend_emails(s):
    r = s.post(f"{BULK}/jobs/{state['job_id']}/resend-emails")
    assert r.status_code == 200
    assert "message" in r.json()


def test_analytics_bulk(s):
    r = s.get(f"{BULK}/analytics")
    assert r.status_code == 200
    d = r.json()
    for k in ["total_jobs", "total_generated", "success_rate"]:
        assert k in d
    assert d["total_jobs"] >= 1
    assert d["total_generated"] >= 3


# --- Retry (with include_invalid) ---
def test_retry_endpoint_responds(s):
    # Create job with one invalid row to force failure (include_invalid true)
    csv_data = "Full Name,Email,Event\n,noname@test.com,Ev\nTEST OK,ok@test.com,Ev\n"
    files = {"file": ("mix.csv", csv_data, "text/csv")}
    up = s.post(f"{BULK}/upload", files=files).json()
    sugg = s.post(f"{BULK}/uploads/{up['upload_id']}/suggest-mapping", json={}).json()["auto_suggestions"]
    mapping = _extract_mapping(sugg)
    j = s.post(f"{BULK}/jobs", json={
        "upload_id": up["upload_id"],
        "template_id": state["template_id"],
        "mapping": mapping,
        "settings": {"include_invalid": True, "skip_invalid": False}
    })
    if j.status_code != 200:
        pytest.skip(f"Cannot create mixed job: {j.text}")
    jid = j.json()["job_id"]
    # Wait
    for _ in range(20):
        st = s.get(f"{BULK}/jobs/{jid}").json()["status"]
        if st in ("completed", "completed_with_errors", "failed"):
            break
        time.sleep(1)
    # Retry (may or may not have failed)
    r = s.post(f"{BULK}/jobs/{jid}/retry")
    # Either responds 200 or 400 (no failed records), never 500
    assert r.status_code in (200, 400), f"Retry returned {r.status_code}: {r.text}"


def test_cancel_endpoint(s):
    # Create a job and try to cancel quickly. Fine if it completes first.
    csv_data = "Full Name,Email,Event\n" + "".join(
        f"TEST U{i},u{i}@test.com,Ev\n" for i in range(10)
    )
    files = {"file": ("c.csv", csv_data, "text/csv")}
    up = s.post(f"{BULK}/upload", files=files).json()
    sugg = s.post(f"{BULK}/uploads/{up['upload_id']}/suggest-mapping", json={}).json()["auto_suggestions"]
    mapping = _extract_mapping(sugg)
    j = s.post(f"{BULK}/jobs", json={
        "upload_id": up["upload_id"],
        "template_id": state["template_id"],
        "mapping": mapping
    }).json()
    jid = j["job_id"]
    r = s.post(f"{BULK}/jobs/{jid}/cancel")
    # Should either accept the cancel (200) or reject if already done (400), never 500
    assert r.status_code in (200, 400), f"cancel returned {r.status_code}: {r.text}"
