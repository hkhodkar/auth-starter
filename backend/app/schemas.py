import re
from datetime import datetime
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    StringConstraints,
    model_validator,
)

from .models import Role


def _strong_password(value: str) -> str:
    if not re.search(r"[A-Za-z]", value) or not re.search(r"\d", value):
        raise ValueError("Password must contain at least one letter and one number")
    return value


def _lower(value: str) -> str:
    return value.lower()


Email = Annotated[EmailStr, AfterValidator(_lower)]
FullName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=100)]
NewPassword = Annotated[str, Field(min_length=8, max_length=128), AfterValidator(_strong_password)]


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str
    role: Role
    is_active: bool
    created_at: datetime
    updated_at: datetime
    last_login_at: datetime | None


class RegisterIn(BaseModel):
    email: Email
    full_name: FullName
    password: NewPassword


class LoginIn(BaseModel):
    email: Email
    password: Annotated[str, Field(min_length=1, max_length=128)]


class RefreshIn(BaseModel):
    refresh_token: Annotated[str, Field(min_length=1, max_length=512)]


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int = Field(description="Access token lifetime in seconds")
    user: UserRead


class ProfileUpdate(BaseModel):
    email: Email | None = None
    full_name: FullName | None = None


class PasswordChange(BaseModel):
    current_password: Annotated[str, Field(min_length=1, max_length=128)]
    new_password: NewPassword

    @model_validator(mode="after")
    def _differs(self) -> "PasswordChange":
        if self.current_password == self.new_password:
            raise ValueError("New password must be different from the current one")
        return self


class AdminUserUpdate(BaseModel):
    role: Role | None = None
    is_active: bool | None = None


class UserPage(BaseModel):
    items: list[UserRead]
    total: int
    page: int
    page_size: int


class UserStats(BaseModel):
    total: int
    active: int
    inactive: int
    admins: int
    new_this_week: int
