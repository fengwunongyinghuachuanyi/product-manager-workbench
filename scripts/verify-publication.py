from pathlib import Path
import hashlib, json
root=Path(__file__).resolve().parents[1]
manifest=root/'SOURCE-MANIFEST.sha256'
rows=manifest.read_text().splitlines()
for row in rows:
    digest,name=row.split('  ',1)
    name=json.loads(name)
    assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest,name
print(f'Publication verified: {len(rows)} files; SHA-256 manifest matches.')
