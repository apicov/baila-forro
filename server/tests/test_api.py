import pytest
from fastapi.testclient import TestClient

from app import create_app

CODE = {"X-Group-Code": "s3cret"}


@pytest.fixture
def client(tmp_path):
    return TestClient(create_app(code="s3cret", db_path=str(tmp_path / "t.db")))


def tag(key, at, rhythm=None, verdict=None, reasons=(), note="", title=None):
    review = {"verdict": verdict, "reasons": list(reasons), "note": note} if verdict else None
    return {"key": key, "title": title or key, "rhythm": rhythm, "review": review, "at": at}


def send(client, device, name, *tags):
    return client.post("/api/tags", headers=CODE, json={"device": device, "name": name, "tags": list(tags)})


def test_the_group_code_is_needed(client):
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/songs").status_code == 401
    assert client.get("/api/songs", headers={"X-Group-Code": "nope"}).status_code == 401
    assert client.post("/api/tags", json={"device": "d", "name": "A", "tags": []}).status_code == 401
    assert client.get("/api/export", headers=CODE).status_code == 200


def test_no_code_set_refuses_everything(tmp_path):
    c = TestClient(create_app(code="", db_path=str(tmp_path / "x.db")))
    assert c.get("/api/songs", headers={"X-Group-Code": ""}).status_code == 503


def test_bad_tags_are_refused(client):
    assert send(client, "d1", "Ana", tag("yt:x", 1, rhythm="samba")).status_code == 422
    assert send(client, "d1", "Ana", tag("yt:x", 1, verdict="fix", reasons=["tempo"])).status_code == 422


def group(client, device):
    return client.get("/api/songs", headers={**CODE, "X-Device": device}).json()["songs"]


def test_latest_tag_wins_per_person(client):
    assert send(client, "d1", "Ana", tag("yt:a", 200, rhythm="forró", verdict="fix", reasons=["steps"], note="late")).json()["received"] == 1
    send(client, "d1", "Ana", tag("yt:a", 100, rhythm="xaxado"))  # older: ignored
    g = group(client, "d1")["yt:a"]
    assert g["rhythms"] == {"forró": 1} and g["review"]["fix"] == 1 and g["review"]["notes"] == [{"name": "Ana", "note": "late", "mine": True}]
    send(client, "d1", "Ana B.", tag("yt:a", 300, rhythm="baião", verdict="fix", note="still late", title="A (new title)"))
    g = group(client, "d1")["yt:a"]
    assert g["rhythms"] == {"baião": 1} and g["review"]["notes"] == [{"name": "Ana B.", "note": "still late", "mine": True}]
    assert client.get("/api/export", headers=CODE).json()["songs"][0]["title"] == "A (new title)"


def test_votes_stay_hidden_until_you_give_yours(client):
    send(client, "d1", "Ana", tag("yt:a", 1, rhythm="forró", verdict="right"), tag("yt:b", 1, verdict="fix", reasons=["audio"], note="noisy"))
    send(client, "d2", "Bia", tag("yt:a", 2, rhythm="forró", verdict="fix", reasons=["steps", "rhythm"], note="2:10 off"))
    send(client, "d3", "Caio", tag("yt:a", 3, rhythm="arrasta-pé"))
    # Caio tagged the rhythm of a, not its review: sees the rhythm votes and how many reviewed, not the reviews
    caio = group(client, "d3")
    assert caio["yt:a"] == {"rhythm_votes": 3, "reviews": 2, "rhythms": {"forró": 2, "arrasta-pé": 1}}
    assert caio["yt:b"] == {"rhythm_votes": 0, "reviews": 1}
    # Bia gave both on a: sees everything there
    a = group(client, "d2")["yt:a"]
    assert a["rhythms"] == {"forró": 2, "arrasta-pé": 1}
    assert a["review"] == {"right": 1, "fix": 1, "reasons": {"steps": 1, "rhythm": 1},
                           "notes": [{"name": "Bia", "note": "2:10 off", "mine": True}]}
    # someone who gave nothing (or no device) sees only the counts
    assert group(client, "d9")["yt:a"] == {"rhythm_votes": 3, "reviews": 2}
    assert client.get("/api/songs", headers=CODE).json()["songs"]["yt:a"] == {"rhythm_votes": 3, "reviews": 2}
    # taking your vote back hides them again
    send(client, "d3", "Caio", tag("yt:a", 4))
    assert group(client, "d3")["yt:a"] == {"rhythm_votes": 2, "reviews": 2}


def test_export_has_every_tag(client):
    send(client, "d1", "Ana", tag("yt:a", 5, rhythm="xaxado", verdict="fix", reasons=["steps"], note="n"))
    out = client.get("/api/export", headers=CODE).json()
    assert out["version"] == 1
    assert out["songs"] == [{"key": "yt:a", "title": "yt:a", "tags": [
        {"device": "d1", "name": "Ana", "rhythm": "xaxado", "review": {"verdict": "fix", "reasons": ["steps"], "note": "n"}, "at": 5}]}]


def test_cors_for_the_app(client):
    pre = client.options("/api/tags", headers={"Origin": "https://localhost", "Access-Control-Request-Method": "POST",
                                               "Access-Control-Request-Headers": "content-type,x-group-code,x-device"})
    assert pre.status_code == 200 and pre.headers["access-control-allow-origin"] == "https://localhost"
