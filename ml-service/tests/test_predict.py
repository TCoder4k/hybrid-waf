from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def predict(endpoint: str, query_params: dict, body=None) -> dict:
    response = client.post(
        "/predict",
        json={
            "method": "GET",
            "endpoint": endpoint,
            "queryParams": query_params,
            "pathParams": {},
            "body": body,
        },
    )
    assert response.status_code == 200
    return response.json()


def test_predict_returns_normal_for_benign_request():
    result = predict("/api/hello", {"id": "42"})
    assert result["classification"] == "NORMAL"
    assert 0.0 <= result["confidence"] <= 1.0


def test_predict_detects_sql_injection():
    result = predict("/api/hello", {"id": "1' OR '1'='1"})
    assert result["classification"] == "SQL_INJECTION"


def test_predict_detects_xss():
    result = predict("/api/hello", {}, body={"comment": "<script>alert(1)</script>"})
    assert result["classification"] == "XSS"


def test_predict_confidence_is_present_and_bounded():
    result = predict("/api/hello", {"q": "hello world"})
    assert isinstance(result["confidence"], float)
    assert 0.0 <= result["confidence"] <= 1.0
