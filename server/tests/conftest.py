import os
import sys
import tempfile
from pathlib import Path

# app.py makes its app at import: give it a throwaway database
os.environ.setdefault("FORRO_DB", str(Path(tempfile.mkdtemp()) / "import.db"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
