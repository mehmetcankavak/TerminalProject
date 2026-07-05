from fastapi.testclient import TestClient

from cryptoterminal.core.event_bus import EventBus
from cryptoterminal.web.server import create_app


def test_spa_fallback_serves_static_file(tmp_path) -> None:
    static_dir = tmp_path / "static"
    static_dir.mkdir()
    (static_dir / "index.html").write_text("index", encoding="utf-8")
    (static_dir / "app.txt").write_text("asset", encoding="utf-8")

    app = create_app(EventBus(), static_dir=str(static_dir))
    client = TestClient(app)

    response = client.get("/app.txt")

    assert response.status_code == 200
    assert response.text == "asset"


def test_spa_fallback_blocks_path_traversal(tmp_path) -> None:
    static_dir = tmp_path / "static"
    static_dir.mkdir()
    (static_dir / "index.html").write_text("index", encoding="utf-8")
    (tmp_path / "secret.txt").write_text("secret", encoding="utf-8")

    app = create_app(EventBus(), static_dir=str(static_dir))
    client = TestClient(app)

    response = client.get("/../secret.txt")

    assert response.status_code == 200
    assert response.text == "index"
