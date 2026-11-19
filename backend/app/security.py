import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash

from .config import Settings
from .models import User

# argon2id with the library's recommended parameters
password_hash = PasswordHash.recommended()

# verified against when the email is unknown, so both paths take about the same time
_DUMMY_HASH = password_hash.hash("not-a-real-password")


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed: str | None) -> bool:
    if hashed is None:
        password_hash.verify(password, _DUMMY_HASH)
        return False
    return password_hash.verify(password, hashed)


class TokenError(Exception):
    pass


@dataclass(frozen=True)
class AccessClaims:
    user_id: int
    role: str
    expires_at: datetime


def create_access_token(user: User, settings: Settings) -> tuple[str, int]:
    now = datetime.now(UTC)
    lifetime = timedelta(minutes=settings.access_token_minutes)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role.value,
        "type": "access",
        "iat": now,
        "exp": now + lifetime,
        "jti": uuid.uuid4().hex,
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, int(lifetime.total_seconds())


def decode_access_token(token: str, settings: Settings) -> AccessClaims:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["sub", "exp", "type"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("Access token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise TokenError("Invalid access token") from exc

    if payload["type"] != "access" or not str(payload["sub"]).isdigit():
        raise TokenError("Invalid access token")
    return AccessClaims(
        user_id=int(payload["sub"]),
        role=payload.get("role", ""),
        expires_at=datetime.fromtimestamp(payload["exp"], UTC),
    )


def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_token_family() -> str:
    return uuid.uuid4().hex
