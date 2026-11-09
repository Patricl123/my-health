# WSGI entry point. Packaged as wsgi.py in the root of the hosted release.
import sys
from pathlib import Path

path = str(Path(__file__).resolve().parent)
if path not in sys.path:
    sys.path.insert(0, path)

from server.wsgi import application
