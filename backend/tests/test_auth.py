import jwt

from app.models import User

from .conftest import PASSWORD, SECRET, auth_header, expired_token


def test_register_returns_tokens_and_a_regular_user(client):
    response = client.post(
        "/api/auth/register",
        json={"email": "Jane@Example.com", "full_name": "  Jane Doe ", "password": PASSWORD},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 15 * 60
    assert body["refresh_token"]
    assert body["user"]["email"] == "jane@example.com"
    assert body["user"]["full_name"] == "Jane Doe"
    assert body["user"]["role"] == "user"

    claims = jwt.decode(body["access_token"], SECRET, algorithms=["HS256"])
    assert claims["sub"] == str(body["user"]["id"])
    assert claims["type"] == "access"


def test_passwords_are_stored_hashed(client, register):
    tokens = register(password="plain-text-1")
    with client.app.state.session_factory() as db:
        stored = db.get(User, tokens["user"]["id"]).password_hash
    assert "plain-text-1" not in stored
    assert stored.startswith("$argon2id$")


def test_register_rejects_duplicate_email_in_any_case(client, register):
    register(email="taken@example.com")
    response = client.post(
        "/api/auth/register",
        json={"email": "TAKEN@example.com", "full_name": "Someone", "password": PASSWORD},
    )
    assert response.status_code == 409


def test_register_validates_password_strength(client):
    response = client.post(
        "/api/auth/register",
        json={"email": "a@example.com", "full_name": "Ann", "password": "onlyletters"},
    )
    assert response.status_code == 422
    assert "letter and one number" in response.json()["detail"][0]["msg"]


def test_login_with_valid_and_invalid_credentials(client, register):
    register(email="me@example.com")
    ok = client.post("/api/auth/login", json={"email": "ME@example.com", "password": PASSWORD})
    assert ok.status_code == 200
    assert ok.json()["user"]["last_login_at"] is not None

    wrong = client.post("/api/auth/login", json={"email": "me@example.com", "password": "nope"})
    unknown = client.post("/api/auth/login", json={"email": "who@example.com", "password": "x"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json() == {"detail": "Incorrect email or password"}


def test_me_requires_a_valid_access_token(client, register):
    tokens = register()
    assert client.get("/api/auth/me").status_code == 401

    response = client.get("/api/auth/me", headers=auth_header(tokens))
    assert response.status_code == 200
    assert response.json()["email"] == tokens["user"]["email"]

    expired = client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {expired_token(tokens['user']['id'])}"}
    )
    assert expired.status_code == 401
    assert expired.json()["detail"] == "Access token expired"
    assert expired.headers["www-authenticate"] == "Bearer"


def test_tampered_or_foreign_tokens_are_rejected(client, register):
    tokens = register()
    claims = jwt.decode(tokens["access_token"], SECRET, algorithms=["HS256"])
    other_key = "another-secret-that-is-long-enough-too"
    forged = jwt.encode(claims | {"role": "admin"}, other_key, algorithm="HS256")
    for token in (forged, tokens["refresh_token"], "not.a.jwt"):
        response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 401


def test_refresh_rotates_the_refresh_token(client, register):
    tokens = register()
    response = client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert response.status_code == 200
    rotated = response.json()
    assert rotated["refresh_token"] != tokens["refresh_token"]
    assert client.get("/api/auth/me", headers=auth_header(rotated)).status_code == 200

    # the next rotation works with the new token
    again = client.post("/api/auth/refresh", json={"refresh_token": rotated["refresh_token"]})
    assert again.status_code == 200


def test_reusing_a_refresh_token_revokes_the_whole_session(client, register):
    tokens = register()
    rotated = client.post(
        "/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    ).json()

    reuse = client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert reuse.status_code == 401

    # the legitimate newer token was revoked together with the family
    after = client.post("/api/auth/refresh", json={"refresh_token": rotated["refresh_token"]})
    assert after.status_code == 401


def test_refresh_sessions_are_independent(client, register):
    register(email="multi@example.com")
    login = {"email": "multi@example.com", "password": PASSWORD}
    laptop = client.post("/api/auth/login", json=login).json()
    phone = client.post("/api/auth/login", json=login).json()

    client.post("/api/auth/logout", json={"refresh_token": laptop["refresh_token"]})

    assert (
        client.post("/api/auth/refresh", json={"refresh_token": laptop["refresh_token"]})
    ).status_code == 401
    assert (
        client.post("/api/auth/refresh", json={"refresh_token": phone["refresh_token"]})
    ).status_code == 200


def test_logout_is_idempotent(client):
    response = client.post("/api/auth/logout", json={"refresh_token": "unknown"})
    assert response.status_code == 204


def test_unknown_refresh_token_is_rejected(client):
    response = client.post("/api/auth/refresh", json={"refresh_token": "made-up"})
    assert response.status_code == 401


def test_update_profile(client, register):
    tokens = register()
    other = register(email="other@example.com")
    headers = auth_header(tokens)

    response = client.patch(
        "/api/auth/me", json={"full_name": "New Name", "email": "NEW@example.com"}, headers=headers
    )
    assert response.status_code == 200
    assert response.json()["full_name"] == "New Name"
    assert response.json()["email"] == "new@example.com"

    taken = client.patch("/api/auth/me", json={"email": other["user"]["email"]}, headers=headers)
    assert taken.status_code == 409

    invalid = client.patch("/api/auth/me", json={"email": "not-an-email"}, headers=headers)
    assert invalid.status_code == 422


def test_change_password(client, register):
    tokens = register(email="pw@example.com")
    other_session = client.post(
        "/api/auth/login", json={"email": "pw@example.com", "password": PASSWORD}
    ).json()
    headers = auth_header(tokens)

    wrong = client.post(
        "/api/auth/me/password",
        json={"current_password": "wrong", "new_password": "brand-new-1"},
        headers=headers,
    )
    assert wrong.status_code == 400

    same = client.post(
        "/api/auth/me/password",
        json={"current_password": PASSWORD, "new_password": PASSWORD},
        headers=headers,
    )
    assert same.status_code == 422

    ok = client.post(
        "/api/auth/me/password",
        json={"current_password": PASSWORD, "new_password": "brand-new-1"},
        headers=headers,
    )
    assert ok.status_code == 200
    assert ok.json()["refresh_token"]

    def login(password: str) -> int:
        return client.post(
            "/api/auth/login", json={"email": "pw@example.com", "password": password}
        ).status_code

    assert login(PASSWORD) == 401
    assert login("brand-new-1") == 200
    # other sessions were signed out
    assert (
        client.post("/api/auth/refresh", json={"refresh_token": other_session["refresh_token"]})
    ).status_code == 401


def test_demo_accounts_are_seeded(seeded_client):
    for email, role in (("admin@demo.dev", "admin"), ("user@demo.dev", "user")):
        response = seeded_client.post(
            "/api/auth/login", json={"email": email, "password": "demo1234"}
        )
        assert response.status_code == 200
        assert response.json()["user"]["role"] == role
