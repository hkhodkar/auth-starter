from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .config import Settings
from .database import utcnow
from .models import RefreshToken, User
from .schemas import TokenPair, UserRead
from .security import (
    create_access_token,
    hash_refresh_token,
    new_refresh_token,
    new_token_family,
)


def _invalid(detail: str) -> HTTPException:
    return HTTPException(
        status.HTTP_401_UNAUTHORIZED, detail=detail, headers={"WWW-Authenticate": "Bearer"}
    )


def issue_tokens(
    db: Session, user: User, settings: Settings, family: str | None = None
) -> TokenPair:
    """Creates an access token and a refresh token. Commits the session."""
    raw = new_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(raw),
            family=family or new_token_family(),
            expires_at=utcnow() + timedelta(days=settings.refresh_token_days),
        )
    )
    db.commit()
    db.refresh(user)
    access, expires_in = create_access_token(user, settings)
    return TokenPair(
        access_token=access,
        refresh_token=raw,
        expires_in=expires_in,
        user=UserRead.model_validate(user),
    )


def revoke_family(db: Session, family: str) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.family == family, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )


def revoke_all(db: Session, user_id: int) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )


def rotate(db: Session, raw: str, settings: Settings) -> TokenPair:
    """Swaps a refresh token for a new pair. The old one can't be used again."""
    token = db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw))
    )
    if token is None:
        raise _invalid("Invalid refresh token")

    if token.revoked_at is not None:
        # a used token came back: assume it leaked and end that whole session
        revoke_family(db, token.family)
        db.commit()
        raise _invalid("Refresh token has been revoked")

    if token.expires_at <= utcnow():
        raise _invalid("Refresh token expired")

    user = token.user
    if not user.is_active:
        raise _invalid("Account is not available")

    token.revoked_at = utcnow()
    return issue_tokens(db, user, settings, family=token.family)


def find_family(db: Session, raw: str) -> str | None:
    return db.scalar(
        select(RefreshToken.family).where(RefreshToken.token_hash == hash_refresh_token(raw))
    )
