import pytest

from backend.app import machines
from backend.app.config import settings
from backend.tests.helpers import make_client

CSV = """slug,name,category,status,training_required,notes
laser-cutter,Success Laser Cutter,Digital Fabrication,available,yes,Book ahead
bambu-x1c,Bambu Labs X-1C,Digital Fabrication,In Use,true,
esd-bench,ESD Workstation,Electronics,maintenance,no,Down for repair
,ghost row without slug,Electronics,available,no,
mystery,Mystery Machine,Other,exploded,no,
"""


@pytest.fixture(autouse=True)
def sheet_configured(monkeypatch):
    monkeypatch.setattr(settings, "machines_sheet_csv_url", "http://sheet.test/csv")
    machines.invalidate_cache()
    yield
    machines.invalidate_cache()


def test_parses_sheet_rows(monkeypatch):
    monkeypatch.setattr(machines, "fetch_sheet_csv", lambda: CSV)
    body = make_client().get("/machines").json()

    slugs = [m["slug"] for m in body]
    assert slugs == ["laser-cutter", "bambu-x1c", "esd-bench", "mystery"]

    laser = body[0]
    assert laser["training_required"] is True
    assert laser["status"] == "available"
    assert body[1]["status"] == "in_use"  # "In Use" normalized
    assert body[3]["status"] == "offline"  # unknown status stays visible
    assert body[2]["notes"] == "Down for repair"


def test_cache_serves_without_refetch(monkeypatch):
    calls = {"n": 0}

    def fetch() -> str:
        calls["n"] += 1
        return CSV

    monkeypatch.setattr(machines, "fetch_sheet_csv", fetch)
    client = make_client()
    assert client.get("/machines").status_code == 200
    assert client.get("/machines").status_code == 200
    assert calls["n"] == 1


def test_stale_copy_served_when_sheet_down(monkeypatch):
    monkeypatch.setattr(machines, "fetch_sheet_csv", lambda: CSV)
    client = make_client()
    assert client.get("/machines").status_code == 200

    def broken() -> str:
        raise RuntimeError("sheet down")

    monkeypatch.setattr(machines, "fetch_sheet_csv", broken)
    monkeypatch.setattr(settings, "machines_cache_seconds", 0)  # force refetch
    response = client.get("/machines")
    assert response.status_code == 200
    assert len(response.json()) == 4


def test_503_when_never_fetched_or_unconfigured(monkeypatch):
    def broken() -> str:
        raise RuntimeError("sheet down")

    monkeypatch.setattr(machines, "fetch_sheet_csv", broken)
    assert make_client().get("/machines").status_code == 503

    monkeypatch.setattr(settings, "machines_sheet_csv_url", "")
    assert make_client().get("/machines").status_code == 503


def test_machine_slugs_for_booking_validation(monkeypatch):
    monkeypatch.setattr(machines, "fetch_sheet_csv", lambda: CSV)
    assert "laser-cutter" in machines.machine_slugs()

    machines.invalidate_cache()
    monkeypatch.setattr(settings, "machines_sheet_csv_url", "")
    assert machines.machine_slugs() == set()
