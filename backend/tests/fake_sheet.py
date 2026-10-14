"""In-memory stand-in for the loans Apps Script web app (epic #7, Contract A).

Tests call FakeSheet.handle directly. For local manual or frontend work, run it
as a server and point the backend at it in .env:

    uv run python -m backend.tests.fake_sheet        # listens on :8099
    LOANS_SCRIPT_URL=http://host.docker.internal:8099
    LOANS_SCRIPT_SECRET=dev-secret
"""

import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

BORROW_FIELDS = (
    "loan_id",
    "borrowed_at",
    "name",
    "email",
    "item",
    "quantity",
    "reason",
    "due_date",
    "borrow_photo",
)
RETURN_FIELDS = ("loan_id", "email", "returned_at", "return_photo")


def has_fields(obj: object, fields: tuple[str, ...]) -> bool:
    return isinstance(obj, dict) and all(obj.get(f) not in (None, "") for f in fields)


class FakeSheet:
    def __init__(self, secret: str) -> None:
        self.secret = secret
        self.rows: list[dict] = []

    def handle(self, body: object) -> dict:
        if not isinstance(body, dict):
            return {"ok": False, "error": "bad_request"}
        if body.get("secret") != self.secret:
            return {"ok": False, "error": "unauthorized"}
        action = body.get("action")
        if action == "borrow" and has_fields(body.get("loan"), BORROW_FIELDS):
            return self.borrow(body["loan"])
        if action == "list" and has_fields(body, ("email",)):
            return self.list(body["email"])
        if action == "return" and has_fields(body, RETURN_FIELDS):
            return self.return_loan(body)
        return {"ok": False, "error": "bad_request"}

    def find(self, loan_id: str) -> dict | None:
        return next((r for r in self.rows if r["loan_id"] == loan_id), None)

    def borrow(self, loan: dict) -> dict:
        if self.find(loan["loan_id"]) is not None:
            return {"ok": True, "duplicate": True}
        row = {f: loan[f] for f in BORROW_FIELDS}
        row.update(status="out", returned_at=None, return_photo=None, return_note=None)
        self.rows.append(row)
        return {"ok": True, "duplicate": False}

    def list(self, email: str) -> dict:
        mine = [r for r in self.rows if r["email"].lower() == email.lower()]
        return {
            "ok": True,
            "loans": [
                {k: v for k, v in r.items() if k not in ("name", "email")} for r in mine
            ],
        }

    def return_loan(self, body: dict) -> dict:
        row = self.find(body["loan_id"])
        if row is None or row["email"].lower() != body["email"].lower():
            return {"ok": False, "error": "not_found"}
        if row["status"] != "out":
            return {"ok": False, "error": "already_returned"}
        row.update(
            status="returned",
            returned_at=body["returned_at"],
            return_photo=body["return_photo"],
            return_note=body.get("return_note") or None,
        )
        return {"ok": True}


def serve(port: int, secret: str = "dev-secret") -> None:
    sheet = FakeSheet(secret)

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:
            raw = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            try:
                body = json.loads(raw)
            except ValueError:
                body = None
            reply = json.dumps(sheet.handle(body)).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(reply)))
            self.end_headers()
            self.wfile.write(reply)

    print(f"fake loans sheet on :{port} (secret {secret!r})", flush=True)
    HTTPServer(("0.0.0.0", port), Handler).serve_forever()


if __name__ == "__main__":
    serve(int(sys.argv[1]) if len(sys.argv) > 1 else 8099)
