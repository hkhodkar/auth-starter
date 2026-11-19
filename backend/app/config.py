import os
import secrets
from dataclasses import dataclass, field


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    return int(value) if value else default


def _env_list(name: str, default: list[str]) -> list[str]:
    value = os.getenv(name)
    if not value:
        return default
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    database_url: str = "sqlite:///./auth.db"
    seed_demo_data: bool = True
    cors_origins: list[str] = field(default_factory=lambda: ["http://localhost:4200"])
    # a random secret means tokens stop working after a restart; set JWT_SECRET in real deployments
    jwt_secret: str = field(default_factory=lambda: secrets.token_urlsafe(32))
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 7

    @classmethod
    def from_env(cls) -> "Settings":
        defaults = cls()
        return cls(
            database_url=os.getenv("DATABASE_URL", defaults.database_url),
            seed_demo_data=_env_bool("SEED_DEMO_DATA", True),
            cors_origins=_env_list("CORS_ORIGINS", defaults.cors_origins),
            jwt_secret=os.getenv("JWT_SECRET") or defaults.jwt_secret,
            access_token_minutes=_env_int("ACCESS_TOKEN_MINUTES", defaults.access_token_minutes),
            refresh_token_days=_env_int("REFRESH_TOKEN_DAYS", defaults.refresh_token_days),
        )
