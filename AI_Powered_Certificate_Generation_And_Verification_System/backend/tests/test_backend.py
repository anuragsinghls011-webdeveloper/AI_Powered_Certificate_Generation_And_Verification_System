"""Backend API tests for CampusCert Pro (Node.js/Express)."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://full-stack-web-19.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# --- Analytics ---
def test_analytics(s):
    r = s.get(f"{API}/analytics")
    assert r.status_code == 200
    d = r.json()
    for key in ["total_certificates", "active_certificates", "revoked_certificates",
                "total_events", "total_templates", "category_breakdown"]:
        assert key in d, f"Missing {key}"


# --- Templates CRUD ---
def test_get_templates(s):
    r = s.get(f"{API}/templates")
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert len(r.json()) >= 1


created_tpl_id = {"id": None}


def test_create_template(s):
    payload = {
        "name": "TEST_Custom Studio",
        "style": "modern",
        "primary_color": "#123456",
        "secondary_color": "#abcdef",
        "border_style": "dashed",
        "issuer_name": "TEST Issuer",
        "issuer_title": "TEST Title",
        "background_image": "",
        "fields": [
            {"id": "f1", "type": "recipient_name", "label": "Name", "x": 100, "y": 200,
             "fontFamily": "Helvetica-Bold", "fontSize": 30, "fontWeight": "bold",
             "fontStyle": "normal", "color": "#000000"}
        ]
    }
    r = s.post(f"{API}/templates", json=payload)
    assert r.status_code == 200
    d = r.json()
    assert d["template"]["name"] == payload["name"]
    assert d["template"]["primary_color"] == "#123456"
    assert len(d["template"]["fields"]) == 1
    created_tpl_id["id"] = d["template"]["id"]

    # Verify via GET list
    r2 = s.get(f"{API}/templates")
    assert any(t["id"] == created_tpl_id["id"] for t in r2.json())


def test_update_template(s):
    tid = created_tpl_id["id"]
    assert tid
    payload = {
        "name": "TEST_Custom Studio Updated",
        "style": "classic",
        "primary_color": "#ff0000",
        "secondary_color": "#00ff00",
        "border_style": "solid",
        "issuer_name": "Updated",
        "issuer_title": "Updated Title",
        "background_image": "",
        "fields": []
    }
    r = s.put(f"{API}/templates/{tid}", json=payload)
    assert r.status_code == 200
    # Verify persisted
    r2 = s.get(f"{API}/templates")
    tpl = next((t for t in r2.json() if t["id"] == tid), None)
    assert tpl and tpl["name"] == "TEST_Custom Studio Updated"
    assert tpl["primary_color"] == "#ff0000"


# --- Events ---
created_event_id = {"id": None}


def test_get_events(s):
    r = s.get(f"{API}/events")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_create_event(s):
    payload = {"title": "TEST_Event", "category": "Workshop", "date": "2025-11-01",
               "organizer": "TEST Org", "location": "TEST Loc", "description": "x"}
    r = s.post(f"{API}/events", json=payload)
    assert r.status_code == 200
    d = r.json()
    assert d["event"]["title"] == "TEST_Event"
    created_event_id["id"] = d["event"]["id"]


# --- Certificates: bulk generate, get, download PDF ---
created_cert_id = {"id": None}


def test_bulk_generate_certificates(s):
    tid = created_tpl_id["id"]
    eid = created_event_id["id"]
    # Restore template fields for PDF custom-layout test
    s.put(f"{API}/templates/{tid}", json={
        "name": "TEST_Custom Studio Updated",
        "style": "modern", "primary_color": "#2563eb", "secondary_color": "#06b6d4",
        "border_style": "solid", "issuer_name": "T", "issuer_title": "T",
        "background_image": "",
        "fields": [
            {"id": "f1", "type": "recipient_name", "label": "Name", "x": 100, "y": 180,
             "fontFamily": "Helvetica-Bold", "fontSize": 32, "fontWeight": "bold",
             "fontStyle": "normal", "color": "#111827"},
            {"id": "f2", "type": "event_title", "label": "Event", "x": 100, "y": 250,
             "fontFamily": "Helvetica", "fontSize": 18, "fontWeight": "normal",
             "fontStyle": "normal", "color": "#2563eb"},
            {"id": "f3", "type": "certificate_qr", "label": "QR", "x": 600, "y": 300,
             "fontFamily": "Helvetica", "fontSize": 12, "fontWeight": "normal",
             "fontStyle": "normal", "color": "#000"}
        ]
    })
    payload = {
        "event_id": eid, "template_id": tid, "issue_date": "2025-11-05",
        "participants": [{"name": "TEST Alice", "email": "alice@test.com", "role": "Winner"}]
    }
    r = s.post(f"{API}/certificates/generate-bulk", json=payload)
    assert r.status_code == 200
    d = r.json()
    assert d["count"] == 1
    assert d["certificates"][0]["cert_id"].startswith("CERT-")
    assert d["certificates"][0]["qr_code_b64"]
    created_cert_id["id"] = d["certificates"][0]["cert_id"]


def test_get_single_certificate(s):
    cid = created_cert_id["id"]
    r = s.get(f"{API}/certificates/{cid}")
    assert r.status_code == 200
    assert r.json()["cert_id"] == cid


def test_download_pdf_custom_template(s):
    cid = created_cert_id["id"]
    r = s.get(f"{API}/certificates/{cid}/download-pdf")
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert len(r.content) > 500
    assert r.content[:4] == b"%PDF"


def test_send_email(s):
    cid = created_cert_id["id"]
    r = s.post(f"{API}/certificates/{cid}/send-email")
    assert r.status_code == 200
    # Verify sent_email flag
    r2 = s.get(f"{API}/certificates/{cid}")
    assert r2.json()["sent_email"] is True


def test_revoke_certificate(s):
    cid = created_cert_id["id"]
    r = s.delete(f"{API}/certificates/{cid}")
    assert r.status_code == 200
    r2 = s.get(f"{API}/certificates/{cid}")
    assert r2.json()["status"] == "Revoked"


# --- Cleanup ---
def test_zz_cleanup(s):
    if created_event_id["id"]:
        s.delete(f"{API}/events/{created_event_id['id']}")
    if created_tpl_id["id"]:
        r = s.delete(f"{API}/templates/{created_tpl_id['id']}")
        assert r.status_code == 200


def test_template_not_found(s):
    r = s.put(f"{API}/templates/nonexistent-id-xyz", json={"name": "x"})
    assert r.status_code == 404
