"""Pico Forró group server: collects the songs' tags (general rhythm; looks right / needs a fix, with reasons
and a note) from the app of everyone in a small group, and gives each person the group's tags back, blind: a
song's votes only once they gave theirs (so nobody just follows the others). /api/export has them all.

One row per person (a device id made by the app, with the name they typed) per song (its YouTube id, or its
title). Every /api call needs the group's code (X-Group-Code). No audio and no accounts.

    FORRO_GROUP_CODE=… FORRO_DB=forro.db uvicorn app:app --port 8060
"""

import hmac
import json
import os
import sqlite3
import time
from collections import Counter
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

Rhythm = Literal["forró", "arrasta-pé", "baião", "xaxado"]
Reason = Literal["steps", "rhythm", "audio"]

# the app's origins: Capacitor on Android, and the dev server
ORIGINS = ["https://localhost", "http://localhost", "http://localhost:5288", "http://localhost:5173"]

SCHEMA = """
CREATE TABLE IF NOT EXISTS songs (key TEXT PRIMARY KEY, title TEXT NOT NULL, first_seen INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS people (device TEXT PRIMARY KEY, name TEXT NOT NULL, last_seen INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tags (
  song_key TEXT NOT NULL REFERENCES songs(key),
  device TEXT NOT NULL REFERENCES people(device),
  rhythm TEXT, verdict TEXT, reasons TEXT NOT NULL DEFAULT '[]', note TEXT NOT NULL DEFAULT '',
  at INTEGER NOT NULL,
  PRIMARY KEY (song_key, device)
);
"""


class Review(BaseModel):
    verdict: Literal["right", "fix"]
    reasons: list[Reason] = []
    note: str = Field("", max_length=500)


class Tag(BaseModel):
    key: str = Field(min_length=1, max_length=200)
    title: str = Field(max_length=300)
    rhythm: Rhythm | None = None
    review: Review | None = None
    at: int  # when the person changed it (ms): the latest wins


class Upload(BaseModel):
    device: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=60)
    tags: list[Tag] = Field(default=[], max_length=5000)


def create_app(code: str | None = None, db_path: str | None = None) -> FastAPI:
    code = os.environ.get("FORRO_GROUP_CODE", "") if code is None else code
    db_path = db_path or os.environ.get("FORRO_DB", "forro.db")
    app = FastAPI(title="Pico Forró group", docs_url=None, redoc_url=None)
    app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET", "POST"],
                       allow_headers=["Content-Type", "X-Group-Code", "X-Device"])

    with sqlite3.connect(db_path) as con:
        con.execute("PRAGMA journal_mode=WAL")
        con.executescript(SCHEMA)

    def db():
        con = sqlite3.connect(db_path)
        con.row_factory = sqlite3.Row
        try:
            yield con
        finally:
            con.close()

    def member(x_group_code: str = Header("")) -> None:
        if not code:
            raise HTTPException(503, "The server has no group code set")
        if not hmac.compare_digest(x_group_code.encode(), code.encode()):
            raise HTTPException(401, "Wrong group code")

    @app.get("/api/health")
    def health():
        return {"ok": True}

    @app.post("/api/tags", dependencies=[Depends(member)])
    def post_tags(up: Upload, con: sqlite3.Connection = Depends(db)):
        now = int(time.time() * 1000)
        with con:
            con.execute("INSERT INTO people VALUES (?, ?, ?) ON CONFLICT(device) DO UPDATE SET name = excluded.name, "
                        "last_seen = excluded.last_seen", (up.device, up.name.strip(), now))
            for t in up.tags:
                con.execute("INSERT INTO songs VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET title = excluded.title",
                            (t.key, t.title, now))
                r = t.review
                con.execute(
                    "INSERT INTO tags VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(song_key, device) DO UPDATE SET "
                    "rhythm = excluded.rhythm, verdict = excluded.verdict, reasons = excluded.reasons, "
                    "note = excluded.note, at = excluded.at WHERE excluded.at >= tags.at",
                    (t.key, up.device, t.rhythm, r.verdict if r else None, json.dumps(r.reasons if r else []),
                     r.note.strip() if r else "", t.at))
        return {"ok": True, "received": len(up.tags)}

    def rows(con: sqlite3.Connection):
        return con.execute(
            "SELECT t.song_key, s.title, t.device, p.name, t.rhythm, t.verdict, t.reasons, t.note, t.at "
            "FROM tags t JOIN songs s ON s.key = t.song_key JOIN people p ON p.device = t.device "
            "ORDER BY s.title, t.at").fetchall()

    @app.get("/api/songs", dependencies=[Depends(member)])
    def group(x_device: str = Header(""), con: sqlite3.Connection = Depends(db)):
        """The group's tags per song, blind: how many voted, and the votes themselves only on the songs where
        this person (X-Device) gave theirs: rhythm votes once they tagged its rhythm, reviews once they reviewed it."""
        songs: dict[str, dict] = {}
        for r in rows(con):
            s = songs.setdefault(r["song_key"], {"tags": [], "mine": None})
            s["tags"].append(r)
            if r["device"] == x_device:
                s["mine"] = r
        out = {}
        for key, s in songs.items():
            tags, mine = s["tags"], s["mine"]
            rhythms = Counter(t["rhythm"] for t in tags if t["rhythm"])
            reviewed = [t for t in tags if t["verdict"]]
            g: dict = {"rhythm_votes": sum(rhythms.values()), "reviews": len(reviewed)}
            if mine is not None and mine["rhythm"]:
                g["rhythms"] = dict(rhythms)
            if mine is not None and mine["verdict"]:
                fixes = [t for t in reviewed if t["verdict"] == "fix"]
                g["review"] = {
                    "right": len(reviewed) - len(fixes),
                    "fix": len(fixes),
                    "reasons": dict(Counter(x for t in fixes for x in json.loads(t["reasons"]))),
                    "notes": [{"name": t["name"], "note": t["note"], "mine": t["device"] == x_device}
                              for t in fixes if t["note"]],
                }
            out[key] = g
        return {"songs": out}

    @app.get("/api/export", dependencies=[Depends(member)])
    def export(con: sqlite3.Connection = Depends(db)):
        songs: dict[str, dict] = {}
        for r in rows(con):
            s = songs.setdefault(r["song_key"], {"key": r["song_key"], "title": r["title"], "tags": []})
            review = {"verdict": r["verdict"], "reasons": json.loads(r["reasons"]), "note": r["note"]} if r["verdict"] else None
            s["tags"].append({"device": r["device"], "name": r["name"], "rhythm": r["rhythm"], "review": review, "at": r["at"]})
        return {"version": 1, "exported": int(time.time() * 1000), "songs": list(songs.values())}

    @app.get("/")
    def about():
        return {"name": "Pico Forró group server", "api": ["/api/tags", "/api/songs", "/api/export", "/api/health"]}

    return app


app = create_app()
