from datetime import timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select

from ..database import utcnow
from ..deps import AdminUser, DbSession
from ..models import Role, User
from ..schemas import AdminUserUpdate, UserPage, UserRead, UserStats
from ..tokens import revoke_all

router = APIRouter(prefix="/users", tags=["users"])

SORT_FIELDS = {
    "full_name": User.full_name,
    "email": User.email,
    "created_at": User.created_at,
    "last_login_at": User.last_login_at,
}
SortOption = Literal[
    "full_name",
    "-full_name",
    "email",
    "-email",
    "created_at",
    "-created_at",
    "last_login_at",
    "-last_login_at",
]


@router.get("", response_model=UserPage)
def list_users(
    _admin: AdminUser,
    db: DbSession,
    search: Annotated[str | None, Query(max_length=100)] = None,
    role: Role | None = None,
    status_: Annotated[Literal["active", "inactive"] | None, Query(alias="status")] = None,
    sort: SortOption = "-created_at",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
) -> UserPage:
    query = select(User)
    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        query = query.where(
            or_(func.lower(User.full_name).like(term), func.lower(User.email).like(term))
        )
    if role is not None:
        query = query.where(User.role == role)
    if status_ is not None:
        query = query.where(User.is_active.is_(status_ == "active"))

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0

    column = SORT_FIELDS[sort.lstrip("-")]
    order = column.desc() if sort.startswith("-") else column.asc()
    # users who never logged in go last either way
    query = query.order_by(column.is_(None), order, User.id)
    items = db.scalars(query.offset((page - 1) * page_size).limit(page_size)).all()
    return UserPage(
        items=[UserRead.model_validate(u) for u in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/stats", response_model=UserStats)
def user_stats(_admin: AdminUser, db: DbSession) -> UserStats:
    def count(*conditions) -> int:
        return db.scalar(select(func.count()).select_from(User).where(*conditions)) or 0

    total = count()
    active = count(User.is_active.is_(True))
    return UserStats(
        total=total,
        active=active,
        inactive=total - active,
        admins=count(User.role == Role.ADMIN),
        new_this_week=count(User.created_at >= utcnow() - timedelta(days=7)),
    )


@router.patch("/{user_id}", response_model=UserRead)
def update_user(user_id: int, payload: AdminUserUpdate, admin: AdminUser, db: DbSession) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")

    changes = payload.model_dump(exclude_unset=True, exclude_none=True)
    if user.id == admin.id and changes:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="You can't change your own role or status"
        )

    for field, value in changes.items():
        setattr(user, field, value)
    if changes.get("is_active") is False:
        revoke_all(db, user.id)
    db.commit()
    db.refresh(user)
    return user
