from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import func, select

from ..database import utcnow
from ..deps import AppSettings, CurrentUser, DbSession
from ..models import User
from ..schemas import (
    LoginIn,
    PasswordChange,
    ProfileUpdate,
    RefreshIn,
    RegisterIn,
    TokenPair,
    UserRead,
)
from ..security import hash_password, verify_password
from ..tokens import find_family, issue_tokens, revoke_all, revoke_family, rotate

router = APIRouter(prefix="/auth", tags=["auth"])


def _email_taken(db: DbSession, email: str, exclude_id: int | None = None) -> bool:
    query = select(func.count()).select_from(User).where(User.email == email)
    if exclude_id is not None:
        query = query.where(User.id != exclude_id)
    return db.scalar(query) > 0


@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterIn, db: DbSession, settings: AppSettings) -> TokenPair:
    if _email_taken(db, payload.email):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="This email is already registered")
    user = User(
        email=payload.email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        last_login_at=utcnow(),
    )
    db.add(user)
    db.flush()
    return issue_tokens(db, user, settings)


@router.post("/login", response_model=TokenPair)
def login(payload: LoginIn, db: DbSession, settings: AppSettings) -> TokenPair:
    user = db.scalar(select(User).where(User.email == payload.email))
    if not verify_password(payload.password, user.password_hash if user else None):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    assert user is not None
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="This account has been deactivated")
    user.last_login_at = utcnow()
    return issue_tokens(db, user, settings)


@router.post("/refresh", response_model=TokenPair)
def refresh(payload: RefreshIn, db: DbSession, settings: AppSettings) -> TokenPair:
    return rotate(db, payload.refresh_token, settings)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(payload: RefreshIn, db: DbSession) -> Response:
    # always 204, so the client can forget its tokens whatever state they are in
    family = find_family(db, payload.refresh_token)
    if family:
        revoke_family(db, family)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserRead)
def me(user: CurrentUser) -> User:
    return user


@router.patch("/me", response_model=UserRead)
def update_me(payload: ProfileUpdate, user: CurrentUser, db: DbSession) -> User:
    changes = payload.model_dump(exclude_unset=True, exclude_none=True)
    if "email" in changes and _email_taken(db, changes["email"], exclude_id=user.id):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="This email is already registered")
    for field, value in changes.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.post("/me/password", response_model=TokenPair)
def change_password(
    payload: PasswordChange, user: CurrentUser, db: DbSession, settings: AppSettings
) -> TokenPair:
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    # sign out every other session, then hand this one a fresh pair
    revoke_all(db, user.id)
    return issue_tokens(db, user, settings)
