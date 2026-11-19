from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .database import utcnow
from .models import Role, User
from .security import hash_password

DEMO_PASSWORD = "demo1234"

# (name, email, role, active, days since sign-up, days since last login)
DEMO_USERS: list[tuple[str, str, Role, bool, int, int | None]] = [
    ("Ava Thompson", "admin@demo.dev", Role.ADMIN, True, 120, 0),
    ("Liam Carter", "user@demo.dev", Role.USER, True, 95, 1),
    ("Sofia Martinez", "sofia.martinez@demo.dev", Role.ADMIN, True, 88, 2),
    ("Noah Becker", "noah.becker@demo.dev", Role.USER, True, 74, 3),
    ("Emma Lindqvist", "emma.lindqvist@demo.dev", Role.USER, True, 61, 6),
    ("Lucas Moreau", "lucas.moreau@demo.dev", Role.USER, False, 57, 40),
    ("Mia Rossi", "mia.rossi@demo.dev", Role.USER, True, 43, 1),
    ("Ethan Walker", "ethan.walker@demo.dev", Role.USER, True, 36, 12),
    ("Chloe Dubois", "chloe.dubois@demo.dev", Role.USER, True, 29, 4),
    ("Daniel Novak", "daniel.novak@demo.dev", Role.USER, False, 22, 21),
    ("Hannah Schmidt", "hannah.schmidt@demo.dev", Role.USER, True, 15, 0),
    ("Oliver Jensen", "oliver.jensen@demo.dev", Role.USER, True, 9, 2),
    ("Isabella Costa", "isabella.costa@demo.dev", Role.USER, True, 5, 1),
    ("James O'Connor", "james.oconnor@demo.dev", Role.USER, True, 3, None),
    ("Zoe Fischer", "zoe.fischer@demo.dev", Role.USER, True, 1, 0),
]


def seed_if_empty(db: Session) -> bool:
    if db.scalar(select(func.count()).select_from(User)):
        return False

    now = utcnow()
    for name, email, role, active, joined, last_login in DEMO_USERS:
        created = now - timedelta(days=joined, hours=len(name))
        db.add(
            User(
                email=email,
                full_name=name,
                password_hash=hash_password(DEMO_PASSWORD),
                role=role,
                is_active=active,
                created_at=created,
                updated_at=created,
                last_login_at=now - timedelta(days=last_login, hours=2)
                if last_login is not None
                else None,
            )
        )
    db.commit()
    return True
