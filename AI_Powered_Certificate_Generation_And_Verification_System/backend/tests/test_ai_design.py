"""AI design endpoint boundaries; only the optional live-generation check calls the provider."""
import os
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

ROOT = Path(__file__).resolve().parents[2]
BACKEND_ENV = dotenv_values(ROOT / "backend" / ".env")
FRONTEND_ENV = dotenv_values(ROOT / "frontend" / ".env")
BASE = (os.environ.get("REACT_APP_BACKEND_URL") or FRONTEND_ENV.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
EMAIL = os.environ.get("AI_TEST_EMAIL", "ai.designer@example.com")
PASSWORD = os.environ.get("AI_TEST_PASSWORD", "DesignAI!2026")
EMPTY = {"id": None, "name": "Untitled Template", "fields": []}


@pytest.fixture(scope="module")
def auth():
    assert BASE, "REACT_APP_BACKEND_URL must be configured"
    response = requests.post(f"{BASE}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=15)
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def request(prompt="Create a clean certificate", template=None):
    return {"prompt": prompt, "template": EMPTY if template is None else template, "conversation": []}


def test_anonymous_rejected():
    assert requests.post(f"{BASE}/api/ai/design", json=request(), timeout=15).status_code == 401


def test_empty_and_oversized_prompts_rejected_without_model_call(auth):
    for prompt in (" ", "x" * 1201):
        response = requests.post(f"{BASE}/api/ai/design", json=request(prompt), headers=auth, timeout=15)
        assert response.status_code == 422


def test_missing_template_and_unsafe_context_rejected(auth):
    for template in ({"fields": "not a list"}, {"id": None, "fields": [{"id": "test", "type": "hologram"}]}):
        response = requests.post(f"{BASE}/api/ai/design", json=request(template=template), headers=auth, timeout=15)
        assert response.status_code == 422


def test_foreign_organization_template_denied_before_provider_call(auth):
    mongo_url = BACKEND_ENV.get("MONGO_URL")
    db_name = BACKEND_ENV.get("DB_NAME")
    if not mongo_url or not db_name:
        pytest.skip("Isolated preview database not configured")
    client = MongoClient(mongo_url)
    col = client[db_name]["templates"]
    foreign_id = f"ai-foreign-{uuid.uuid4().hex}"
    col.insert_one({"id": foreign_id, "organization_id": "not-the-current-organization", "name": "Foreign certificate", "fields": []})
    try:
        response = requests.post(f"{BASE}/api/ai/design", json=request(template={"id": foreign_id, "fields": []}), headers=auth, timeout=15)
        assert response.status_code == 404, response.text
    finally:
        col.delete_one({"id": foreign_id})
        client.close()


def test_real_provider_generates_valid_operations(auth):
    if os.environ.get('RUN_LIVE_AI_TEST') != '1':
        pytest.skip('Set RUN_LIVE_AI_TEST=1 to make a live Gemini request')
    response = requests.post(f"{BASE}/api/ai/design", json=request("Add QR verification at the bottom right"), headers=auth, timeout=70)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["success"] is True
    assert any(op["field_type"] == "certificate_qr" for op in result["design"]["field_operations"])