"""Regression smoke for core certificate workflows after Event Reports changes."""
import os
import uuid
from pathlib import Path

import pytest
import requests


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

ADMIN_EMAIL = os.environ.get("REPORT_TEST_ADMIN_EMAIL") or BACK_ENV.get("REPORT_TEST_ADMIN_EMAIL")
ADMIN_PASSWORD = os.environ.get("REPORT_TEST_ADMIN_PASSWORD") or BACK_ENV.get("REPORT_TEST_ADMIN_PASSWORD")


@pytest.fixture(scope="module")
def s():
    if not BASE_URL:
        pytest.fail("REACT_APP_BACKEND_URL is required")
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    login = sess.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert login.status_code == 200, login.text
    yield sess


@pytest.fixture(scope="module")
def state(s):
    st = {}
    ev_payload = {
        "title": f"TEST_SMOKE_EVT_{uuid.uuid4().hex[:8]}",
        "category": "Workshop",
        "date": "2026-02-10",
        "organizer": "QA",
        "location": "Lab",
        "description": "Smoke"
    }
    ev = s.post(f"{BASE_URL}/api/events", json=ev_payload, timeout=30)
    assert ev.status_code == 200, ev.text
    st["event_id"] = ev.json()["event"]["id"]

    tpls = s.get(f"{BASE_URL}/api/templates", timeout=30)
    assert tpls.status_code == 200 and len(tpls.json()) > 0
    st["template_id"] = tpls.json()[0]["id"]
    yield st
    s.delete(f"{BASE_URL}/api/events/{st['event_id']}", timeout=30)


# Core authenticated platform endpoints smoke
def test_auth_and_analytics_smoke(s):
    me = s.get(f"{BASE_URL}/api/auth/me", timeout=30)
    assert me.status_code == 200
    analytics = s.get(f"{BASE_URL}/api/analytics", timeout=30)
    assert analytics.status_code == 200
    data = analytics.json()
    assert "total_certificates" in data


# Single certificate generation + verification fetch + PDF download
def test_single_certificate_generation_and_pdf_smoke(s, state):
    payload = {
        "event_id": state["event_id"],
        "template_id": state["template_id"],
        "name": "Smoke User",
        "email": f"smoke_{uuid.uuid4().hex[:6]}@example.com",
        "role": "Participant",
        "grade": "Pass",
        "issue_date": "2026-02-10"
    }
    create = s.post(f"{BASE_URL}/api/certificates", json=payload, timeout=30)
    assert create.status_code == 200, create.text
    cert = create.json()["certificate"]
    cert_id = cert["cert_id"]

    fetched = s.get(f"{BASE_URL}/api/certificates/{cert_id}", timeout=30)
    assert fetched.status_code == 200
    assert fetched.json()["cert_id"] == cert_id

    pdf = s.get(f"{BASE_URL}/api/certificates/{cert_id}/download-pdf", timeout=60)
    assert pdf.status_code == 200
    assert pdf.headers.get("content-type", "").startswith("application/pdf")
    assert pdf.content[:4] == b"%PDF"

    state["cert_id"] = cert_id


# Revocation + "send email" (MOCKED behavior sets sent_email flag only)
def test_revoke_and_send_email_smoke(s, state):
    cert_id = state["cert_id"]
    send = s.post(f"{BASE_URL}/api/certificates/{cert_id}/send-email", timeout=30)
    assert send.status_code == 200

    details = s.get(f"{BASE_URL}/api/certificates/{cert_id}", timeout=30)
    assert details.status_code == 200
    assert details.json().get("sent_email") is True

    revoke = s.delete(f"{BASE_URL}/api/certificates/{cert_id}", timeout=30)
    assert revoke.status_code == 200
    details2 = s.get(f"{BASE_URL}/api/certificates/{cert_id}", timeout=30)
    assert details2.status_code == 200
    assert details2.json().get("status") == "Revoked"


# Bulk studio backend path smoke: limits + sample + upload + mapping + validate
def test_bulk_endpoints_smoke(s):
    limits = s.get(f"{BASE_URL}/api/bulk/limits", timeout=30)
    assert limits.status_code == 200

    sample = s.get(f"{BASE_URL}/api/bulk/sample-template?format=csv", timeout=30)
    assert sample.status_code == 200
    assert sample.headers.get("content-type", "").startswith("text/csv")

    csv_body = "Full Name,Email,Event\nSmoke A,smokea@example.com,Smoke Event\n"
    upload_s = requests.Session()
    for cookie in s.cookies:
        upload_s.cookies.set(cookie.name, cookie.value, domain=cookie.domain, path=cookie.path)
    up = upload_s.post(f"{BASE_URL}/api/bulk/upload", files={"file": ("smoke.csv", csv_body, "text/csv")}, timeout=60)
    assert up.status_code == 200, up.text
    upload_id = up.json()["upload_id"]

    sugg = s.post(f"{BASE_URL}/api/bulk/uploads/{upload_id}/suggest-mapping", json={}, timeout=30)
    assert sugg.status_code == 200
    mapping = sugg.json()["auto_suggestions"]
    assert mapping

    validate = s.post(f"{BASE_URL}/api/bulk/uploads/{upload_id}/validate", json={"mapping": mapping}, timeout=30)
    assert validate.status_code == 200
    assert "summary" in validate.json()
