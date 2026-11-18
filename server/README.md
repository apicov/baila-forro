# Pico Forró group server

Collects the songs' tags from the app of everyone in a small group and shows them on a dashboard:
- each song's general rhythm (forró, arrasta-pé, baião, xaxado);
- whether what the app shows looks right or needs a fix, with the reasons (steps, rhythm, audio) and a note.

Songs are known by their YouTube id (from the file name), or by their title if there's none. No audio is ever
sent. There are no accounts: one group code, typed once in the app (Library ⋮ → Sharing) with a name.

- `POST /api/tags`: the app sends a person's changed tags. One row per person per song; the latest wins.
- `GET /api/summary`: per song, the rhythm votes (with the consensus, or none on a tie), the ✓ / ⚠ counts,
  the reasons and the notes.
- `GET /api/export`: every tag as JSON, the dataset.
- `GET /`: the dashboard. It asks for the group code once.

Every `/api` call except `/api/health` needs the `X-Group-Code` header.

## Run locally
```
uv venv .venv && uv pip install -p .venv/bin/python -r requirements.txt -r requirements-dev.txt
.venv/bin/python -m pytest tests
FORRO_GROUP_CODE=test FORRO_DB=/tmp/forro.db .venv/bin/uvicorn app:app --port 8061
```

## On the Linode (`forro.apicov.xyz`)
- A systemd service as `tsp`, uvicorn on 127.0.0.1:8060, behind Apache.
- SQLite database in `~tsp/pico-forro-data/forro.db`.
- Code and database path in `/etc/pico-forro/server.env`.

**First time:** the DNS A record `forro.apicov.xyz → 172.104.159.186` must exist. Then:
```
rsync -a --delete --exclude .venv --exclude '*.db*' --exclude __pycache__ server/ tsp@172.104.159.186:code/pico-forro-server/
ssh tsp@172.104.159.186 'cd code/pico-forro-server && python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt'
ssh -t tsp@172.104.159.186 'sudo bash ~/code/pico-forro-server/deploy/setup-server.sh'
```
The setup script prints the group code. Running it again keeps the code and the data.

**Updates:** run the same rsync, then `ssh -t tsp@172.104.159.186 'sudo systemctl restart pico-forro'`.
