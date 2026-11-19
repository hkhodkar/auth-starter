import pytest

from .conftest import PASSWORD, auth_header


@pytest.mark.parametrize(
    ("method", "path"),
    [("get", "/api/users"), ("get", "/api/users/stats"), ("patch", "/api/users/1")],
)
def test_admin_routes_need_a_token_and_the_admin_role(client, register, method, path):
    assert client.request(method, path, json={}).status_code == 401

    user = register()
    response = client.request(method, path, json={}, headers=auth_header(user))
    assert response.status_code == 403
    assert response.json()["detail"] == "Admin role required"


def test_admin_lists_users_with_filters_and_paging(seeded_client):
    tokens = seeded_client.post(
        "/api/auth/login", json={"email": "admin@demo.dev", "password": "demo1234"}
    ).json()
    headers = auth_header(tokens)

    page = seeded_client.get("/api/users?page_size=5&page=2", headers=headers).json()
    assert page["total"] == 15
    assert page["page"] == 2
    assert len(page["items"]) == 5

    admins = seeded_client.get("/api/users?role=admin", headers=headers).json()
    assert {u["email"] for u in admins["items"]} == {"admin@demo.dev", "sofia.martinez@demo.dev"}

    inactive = seeded_client.get("/api/users?status=inactive", headers=headers).json()
    assert inactive["total"] == 2
    assert all(not u["is_active"] for u in inactive["items"])

    search = seeded_client.get("/api/users?search=ROSSI", headers=headers).json()
    assert [u["full_name"] for u in search["items"]] == ["Mia Rossi"]

    by_name = seeded_client.get("/api/users?sort=full_name&page_size=100", headers=headers).json()
    names = [u["full_name"] for u in by_name["items"]]
    assert names == sorted(names)

    by_login = seeded_client.get(
        "/api/users?sort=-last_login_at&page_size=100", headers=headers
    ).json()
    assert by_login["items"][-1]["last_login_at"] is None

    bad = seeded_client.get("/api/users?sort=password_hash", headers=headers)
    assert bad.status_code == 422


def test_stats(seeded_client):
    tokens = seeded_client.post(
        "/api/auth/login", json={"email": "admin@demo.dev", "password": "demo1234"}
    ).json()
    stats = seeded_client.get("/api/users/stats", headers=auth_header(tokens)).json()
    assert stats == {"total": 15, "active": 13, "inactive": 2, "admins": 2, "new_this_week": 3}


def test_admin_changes_roles(client, register, make_admin):
    admin = make_admin()
    user = register()
    user_id = user["user"]["id"]

    promoted = client.patch(
        f"/api/users/{user_id}", json={"role": "admin"}, headers=auth_header(admin)
    )
    assert promoted.status_code == 200
    assert promoted.json()["role"] == "admin"
    # the role comes from the database, so the old token already has admin access
    assert client.get("/api/users", headers=auth_header(user)).status_code == 200

    client.patch(f"/api/users/{user_id}", json={"role": "user"}, headers=auth_header(admin))
    assert client.get("/api/users", headers=auth_header(user)).status_code == 403


def test_deactivated_users_are_locked_out(client, register, make_admin):
    admin = make_admin()
    user = register(email="leaving@example.com")

    response = client.patch(
        f"/api/users/{user['user']['id']}", json={"is_active": False}, headers=auth_header(admin)
    )
    assert response.status_code == 200
    assert response.json()["is_active"] is False

    assert client.get("/api/auth/me", headers=auth_header(user)).status_code == 401
    assert (
        client.post("/api/auth/refresh", json={"refresh_token": user["refresh_token"]})
    ).status_code == 401
    login = client.post(
        "/api/auth/login", json={"email": "leaving@example.com", "password": PASSWORD}
    )
    assert login.status_code == 403

    client.patch(
        f"/api/users/{user['user']['id']}", json={"is_active": True}, headers=auth_header(admin)
    )
    login = client.post(
        "/api/auth/login", json={"email": "leaving@example.com", "password": PASSWORD}
    )
    assert login.status_code == 200


def test_admins_cannot_change_themselves(client, make_admin):
    admin = make_admin()
    response = client.patch(
        f"/api/users/{admin['user']['id']}", json={"role": "user"}, headers=auth_header(admin)
    )
    assert response.status_code == 400


def test_unknown_user(client, make_admin):
    admin = make_admin()
    response = client.patch("/api/users/999", json={"role": "user"}, headers=auth_header(admin))
    assert response.status_code == 404


def test_role_must_be_known(client, register, make_admin):
    admin = make_admin()
    user = register()
    response = client.patch(
        f"/api/users/{user['user']['id']}", json={"role": "owner"}, headers=auth_header(admin)
    )
    assert response.status_code == 422
