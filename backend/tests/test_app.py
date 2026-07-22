from fastapi.testclient import TestClient

from app.main import app


def test_application_scaffold() -> None:
    client = TestClient(app)

    response = client.get("/")

    assert app.title == "SewnCovers API"
    assert response.status_code == 200
    assert response.json() == {"service": "SewnCovers API", "status": "ready"}
