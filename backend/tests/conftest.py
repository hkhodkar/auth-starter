from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

SECRET = "test-secret-that-is-long-enough-for-hs256"
PASSWORD = "s3cret-pass"


def make_settings(**overrides) -> Settings:
    options = {"database_url": "sqlite://", "seed_demo_data": False, "jwt_secret": SECRET}
    return Settings(**(options | overrides))


@pytest.fixture
def client():
    with TestClient(create_app(make_settings())) as client:
        yield client


@pytest.fixture
def seeded_client():
    with TestClient(create_app(make_settings(seed_demo_data=True))) as client:
        yield client


def auth_header(tokens: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def expired_token(user_id: int) -> str:
    past = datetime.now(UTC) - timedelta(minutes=5)
    payload = {"sub": str(user_id), "role": "user", "type": "access", "iat": past, "exp": past}
    return jwt.encode(payload, SECRET, algorithm="HS256")


@pytest.fixture
def register(client):
    counter = iter(range(1, 10_000))

    def _register(**overrides) -> dict:
        n = next(counter)
        payload = {
            "email": f"person{n}@example.com",
            "full_name": f"Person {n}",
            "password": PASSWORD,
        } | overrides
        response = client.post("/api/auth/register", json=payload)
        assert response.status_code == 201, response.text
        return response.json()

    return _register


@pytest.fixture
def make_admin(client, register):
    """Registers a user and promotes them straight in the database."""

    def _make() -> dict:
        tokens = register()
        with client.app.state.session_factory() as db:
            from app.models import Role, User

            user = db.get(User, tokens["user"]["id"])
            user.role = Role.ADMIN
            db.commit()
        return tokens

    return _make
