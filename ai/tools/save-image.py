#!/usr/bin/env python3
"""Save a `data:` URL image returned by movie.contactSheet / movie.snapshot (as: 'dataURL') to a PNG file.

agent-browser prints the eval result as a JSON string; a raw data URL also works:

  agent-browser eval "movie.contactSheet({ count: 6, as: 'dataURL' })" | python3 ai/tools/save-image.py /abs/path/sheet.png

Use an ABSOLUTE output path. Prints the path and byte size.
"""
import base64, json, sys

if len(sys.argv) != 2:
    sys.exit('usage: save-image.py /absolute/output.png   (data URL or JSON string on stdin)')
raw = sys.stdin.read().strip()
try:
    value = json.loads(raw)
except ValueError:
    value = raw
if not isinstance(value, str) or not value.startswith('data:') or ',' not in value:
    sys.exit('stdin is not a data: URL — got: ' + raw[:120])
data = base64.b64decode(value.split(',', 1)[1])
with open(sys.argv[1], 'wb') as f:
    f.write(data)
print(f'{sys.argv[1]} ({len(data)} bytes)')
