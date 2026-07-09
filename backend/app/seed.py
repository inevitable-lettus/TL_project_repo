"""Seed sample users/projects with images for demos and from-scratch E2E.

Run inside the container: docker compose exec backend python -m backend.app.seed
Refuses to run twice (checks for its own staff user).
"""

import io
import struct
import sys
import uuid
import zlib

from . import storage
from .db import SessionLocal
from .models import File, Project, User

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

        cover = add_file(
            db,
            project,
            "cover.png",
            make_png(PALETTE[index % len(PALETTE)]),
            "image/png",
            "media",
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
        project.content = doc(description, cover.id)
        if is_public:
            if index < 3:
                project.featured_rank = index
            if index < 2:
                project.slider_pinned = True

    db.commit()
    print(f"seeded {len(SAMPLE_PROJECTS)} projects for {len(students)} students")


if __name__ == "__main__":
    main()
