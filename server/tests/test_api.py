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
    assert client.get("/api/summary").status_code == 401
    assert client.get("/api/summary", headers={"X-Group-Code": "nope"}).status_code == 401
    assert client.post("/api/tags", json={"device": "d", "name": "A", "tags": []}).status_code == 401
    assert client.get("/api/export", headers=CODE).status_code == 200


def test_no_code_set_refuses_everything(tmp_path):
    c = TestClient(create_app(code="", db_path=str(tmp_path / "x.db")))
    assert c.get("/api/summary", headers={"X-Group-Code": ""}).status_code == 503


def test_bad_tags_are_refused(client):
    assert send(client, "d1", "Ana", tag("yt:x", 1, rhythm="samba")).status_code == 422
    assert send(client, "d1", "Ana", tag("yt:x", 1, verdict="fix", reasons=["tempo"])).status_code == 422


def test_latest_tag_wins_per_person(client):
    assert send(client, "d1", "Ana", tag("yt:a", 200, rhythm="forró", verdict="fix", reasons=["steps"], note="late")).json()["received"] == 1
    send(client, "d1", "Ana", tag("yt:a", 100, rhythm="xaxado"))  # older: ignored
    s = client.get("/api/summary", headers=CODE).json()["songs"][0]
    assert s["rhythms"] == {"forró": 1} and s["fix"] == 1 and s["votes"][0]["note"] == "late"
    send(client, "d1", "Ana B.", tag("yt:a", 300, rhythm="baião", verdict="right", title="A (new title)"))
    s = client.get("/api/summary", headers=CODE).json()["songs"][0]
    assert s["title"] == "A (new title)" and s["rhythms"] == {"baião": 1} and (s["right"], s["fix"]) == (1, 0)
    assert s["votes"][0]["name"] == "Ana B."  # the person's latest name


def test_summary_counts_and_consensus(client):
    send(client, "d1", "Ana", tag("yt:a", 1, rhythm="forró", verdict="right"), tag("yt:b", 1, verdict="fix", reasons=["audio"]))
    send(client, "d2", "Bia", tag("yt:a", 2, rhythm="forró", verdict="fix", reasons=["steps", "rhythm"], note="2:10 off"))
    send(client, "d3", "Caio", tag("yt:a", 3, rhythm="arrasta-pé"), tag("yt:b", 3))
    body = client.get("/api/summary", headers=CODE).json()
    assert body["people"] == 3
    a = next(s for s in body["songs"] if s["key"] == "yt:a")
    assert a["rhythms"] == {"forró": 2, "arrasta-pé": 1} and a["rhythm"] == "forró"
    assert (a["right"], a["fix"]) == (1, 1) and a["reasons"] == {"steps": 1, "rhythm": 1} and a["disagree"]
    assert a["last"] == 3
    b = next(s for s in body["songs"] if s["key"] == "yt:b")
    assert b["rhythms"] == {} and b["rhythm"] is None and b["fix"] == 1 and not b["disagree"]


def test_a_tie_has_no_consensus(client):
    send(client, "d1", "Ana", tag("yt:a", 1, rhythm="forró"))
    send(client, "d2", "Bia", tag("yt:a", 1, rhythm="baião"))
    assert client.get("/api/summary", headers=CODE).json()["songs"][0]["rhythm"] is None


def test_export_has_every_tag(client):
    send(client, "d1", "Ana", tag("yt:a", 5, rhythm="xaxado", verdict="fix", reasons=["steps"], note="n"))
    out = client.get("/api/export", headers=CODE).json()
    assert out["version"] == 1
    assert out["songs"] == [{"key": "yt:a", "title": "yt:a", "tags": [
        {"device": "d1", "name": "Ana", "rhythm": "xaxado", "review": {"verdict": "fix", "reasons": ["steps"], "note": "n"}, "at": 5}]}]


def test_the_dashboard_page_and_cors(client):
    assert "Pico Forró group" in client.get("/").text
    pre = client.options("/api/tags", headers={"Origin": "https://localhost", "Access-Control-Request-Method": "POST",
                                               "Access-Control-Request-Headers": "content-type,x-group-code"})
    assert pre.status_code == 200 and pre.headers["access-control-allow-origin"] == "https://localhost"
