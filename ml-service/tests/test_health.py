from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_reports_ok_and_model_version():
    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["model_version"]


def test_predict_reports_how_long_the_model_took():
    # BT-23: latency evidence on every answer, e.g. "predict;dur=0.4".
    response = client.post(
        "/predict",
        json={
            "text": "Waiters needed tonight\nReply by 5 pm",
            "type": "job_alert",
            "recipient_role": "worker",
            "created_at": "2026-11-07T08:00:00+03:00",
            "sender_role": "business",
            "deadline_minutes": 90,
        },
    )
    assert response.status_code == 200
    timing = response.headers["server-timing"]
    assert timing.startswith("predict;dur=")
    assert float(timing.split("=")[1]) >= 0
