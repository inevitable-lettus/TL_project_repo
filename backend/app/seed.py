"""Seed sample users/projects with images for demos and from-scratch E2E.

Run inside the container: docker compose exec backend python -m backend.app.seed
Refuses to run twice (checks for its own staff user).
"""

import io
import struct
import sys
import uuid
import zlib
from datetime import datetime, timedelta

from . import storage
from .db import SessionLocal
from .loans import lab_today
from .models import File, Loan, LoanPhoto, Project, User

STAFF_EMAIL = "staff@uni.edu"

PALETTE = [
    (255, 99, 26),  # brand orange
    (47, 108, 45),  # success green
    (157, 50, 0),  # rust
    (194, 65, 12),  # warning
    (56, 28, 0),  # espresso
]


def make_png(rgb: tuple[int, int, int], width: int = 640, height: int = 360) -> bytes:
    """Solid-color PNG via stdlib only — no image library dependency."""

    def chunk(kind: bytes, payload: bytes) -> bytes:
        return (
            struct.pack(">I", len(payload))
            + kind
            + payload
            + struct.pack(">I", zlib.crc32(kind + payload))
        )

    row = b"\x00" + bytes(rgb) * width  # filter byte + RGB pixels
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(row * height))
        + chunk(b"IEND", b"")
    )


def add_file(
    db, project: Project, filename: str, data: bytes, mime: str, kind: str
) -> File:
    file_id = uuid.uuid4()
    file = File(
        id=file_id,
        project_id=project.id,
        filename=filename,
        object_key=f"projects/{project.id}/{file_id}/{filename}",
        size=len(data),
        mime_type=mime,
        status="ready",
        kind=kind,
    )
    storage.client.put_object(
        storage.settings.minio_bucket,
        file.object_key,
        io.BytesIO(data),
        len(data),
        content_type=mime,
    )
    db.add(file)
    db.flush()
    return file


def add_loan_photo(db, owner: User, rgb: tuple[int, int, int]) -> File:
    file_id = uuid.uuid4()
    data = make_png(rgb, width=320, height=240)
    file = File(
        id=file_id,
        owner_id=owner.id,
        filename="loan.png",
        object_key=f"loans/{owner.id}/{file_id}/loan.png",
        size=len(data),
        mime_type="image/png",
        status="ready",
        kind="loan_photo",
    )
    storage.client.put_object(
        storage.settings.minio_bucket,
        file.object_key,
        io.BytesIO(data),
        len(data),
        content_type="image/png",
    )
    db.add(file)
    db.flush()
    return file


def seed_loans(db, students: list[User], projects: list[Project]) -> int:
    """A few loans of each status: out, overdue, returned, used."""
    today = lab_today()
    now = datetime.now().astimezone()
    ada, sam = students
    ada_project = next(p for p in projects if p.owner_id == ada.id)
    rows = [
        # (borrower, type, item, qty, unit, project, due, borrowed days ago, returned)
        (ada, "equipment", "Multimeter", 1, "pcs", ada_project, 5, 2, False),
        (sam, "equipment", "Soldering iron", 1, "pcs", None, 10, 1, False),
        (ada, "equipment", "Oscilloscope probe", 2, "pcs", None, -3, 12, False),
        (sam, "equipment", "Digital calipers", 1, "pcs", None, -1, 8, False),
        (ada, "equipment", "Hot glue gun", 1, "pcs", ada_project, -6, 14, True),
        (sam, "equipment", "Bench power supply", 1, "pcs", None, 2, 9, True),
        (ada, "material", "PLA filament", 250, "g", ada_project, None, 3, False),
        (sam, "material", "Acrylic sheet 3mm", 2, "sheets", None, None, 6, False),
    ]
    for index, (who, kind, item, qty, unit, project, due, ago, returned) in enumerate(
        rows
    ):
        borrowed_at = now - timedelta(days=ago)
        loan = Loan(
            id=uuid.uuid4(),
            borrower_id=who.id,
            type=kind,
            item_name=item,
            description=f"{item} for a lab build.",
            quantity=qty,
            unit=unit,
            project_id=project.id if project else None,
            due_date=today + timedelta(days=due) if due is not None else None,
            borrowed_at=borrowed_at,
            returned_at=borrowed_at + timedelta(days=1) if returned else None,
            returned_by_id=who.id if returned else None,
        )
        db.add(loan)
        db.flush()
        rgb = PALETTE[index % len(PALETTE)]
        stages = [("borrow", 0)] + ([("return", 0)] if returned else [])
        for stage, position in stages:
            photo = add_loan_photo(db, who, rgb)
            db.add(
                LoanPhoto(
                    file_id=photo.id, loan_id=loan.id, stage=stage, position=position
                )
            )
    db.flush()
    return len(rows)


def doc(intro: str, media_file_id: uuid.UUID) -> dict:
    return {
        "type": "doc",
        "content": [
            {
                "type": "heading",
                "attrs": {"level": 2},
                "content": [{"type": "text", "text": "The build"}],
            },
            {"type": "paragraph", "content": [{"type": "text", "text": intro}]},
            {"type": "media", "attrs": {"fileId": str(media_file_id)}},
            {
                "type": "paragraph",
                "content": [
                    {
                        "type": "text",
                        "text": "Files for reproducing it are in the downloads below.",
                    }
                ],
            },
        ],
    }


SAMPLE_PROJECTS = [
    ("CNC Pen Plotter", "A drawing robot from drawer slides.", True),
    ("Mushroom Lamp", "3D-printed lamp with a breathing LED.", True),
    ("Kinetic Sand Table", "A magnet drags a ball through sand.", True),
    ("Weather Station", "ESP32 station logging to the lab dashboard.", True),
    ("Corner Bookshelf", "First woodworking project — CNC-cut joints.", True),
    (
        "Laser-Cut Puzzle Box",
        "Interlocking finger joints, cut on the lab laser, no glue.",
        True,
    ),
    (
        "Arduino Plant Waterer",
        "Soil-moisture sensor drives a pump on a schedule.",
        True,
    ),
    (
        "Retro Handheld Console",
        "Raspberry Pi emulator in a printed shell with real buttons.",
        True,
    ),
    (
        "Geodesic Cardboard Dome",
        "A 1.5m play dome from scored, folded cardboard triangles.",
        True,
    ),
    (
        "Belt-Drive Longboard",
        "Electric skateboard: hobby ESC, thumb throttle, printed mounts.",
        True,
    ),
    (
        "PID Reflow Hotplate",
        "Turned a cheap hotplate into a solder-reflow station.",
        True,
    ),
    ("Secret Robot", "Competition entry, unlisted until the reveal.", False),
]


def main() -> None:
    storage.ensure_bucket()
    db = SessionLocal()
    if db.query(User).filter_by(email=STAFF_EMAIL).first():
        print("already seeded (staff user exists) — nothing to do")
        sys.exit(0)

    staff = User(name="Lab Staff", email=STAFF_EMAIL, role="staff")
    students = [
        User(name="Ada Chen", email="ada@uni.edu"),
        User(name="Sam Okafor", email="sam@uni.edu"),
    ]
    db.add_all([staff, *students])
    db.flush()

    projects = []
    for index, (title, description, is_public) in enumerate(SAMPLE_PROJECTS):
        owner = students[index % len(students)]
        project = Project(
            title=title,
            description=description,
            owner_id=owner.id,
            is_public=is_public,
        )
        db.add(project)
        db.flush()
        projects.append(project)

        cover = add_file(
            db,
            project,
            "cover.png",
            make_png(PALETTE[index % len(PALETTE)]),
            "image/png",
            "media",
        )
        thumb = add_file(
            db,
            project,
            "cover-thumb.png",
            make_png(PALETTE[index % len(PALETTE)], width=320, height=180),
            "image/png",
            "thumb",
        )
        add_file(
            db,
            project,
            "build-notes.txt",
            f"Build notes for {title}.\n".encode(),
            "text/plain",
            "attachment",
        )
        project.cover_file_id = cover.id
        project.cover_thumb_file_id = thumb.id
        project.content = doc(description, cover.id)
        if is_public:
            if index < 3:
                project.featured_rank = index
            if index < 2:
                project.slider_pinned = True

    loan_count = seed_loans(db, students, projects)
    db.commit()
    print(
        f"seeded {len(SAMPLE_PROJECTS)} projects and {loan_count} loans"
        f" for {len(students)} students"
    )


if __name__ == "__main__":
    main()
