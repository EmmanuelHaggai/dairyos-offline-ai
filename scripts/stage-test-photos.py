#!/usr/bin/env python3
"""Fetch two public research images for pilot checks, not diagnostic validation."""
import json
from pathlib import Path
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent.parent / '.private' / 'photo-checks'
ROOT.mkdir(parents=True, exist_ok=True)
base = 'https://api.github.com/repos/spMohanty/PlantVillage-Dataset/contents/raw/color/'
manifest = []
for name, category in [('leaf-a.jpg', 'Tomato___healthy'), ('leaf-b.jpg', 'Tomato___Bacterial_spot')]:
    listing = json.load(urllib.request.urlopen(base + urllib.parse.quote(category), timeout=30))
    image = next(row for row in listing if row['name'].lower().endswith(('.jpg', '.jpeg')))
    data = urllib.request.urlopen(image['download_url'], timeout=30).read()
    (ROOT / name).write_bytes(data)
    manifest.append({'file': name, 'datasetCategory': category, 'source': image['html_url'], 'dataset': 'PlantVillage, Mohanty, Hughes and Salathe (2016), doi:10.3389/fpls.2016.01419', 'limitation': 'Controlled research leaf image, not a representative farmer field photo or proof of diagnosis.'})
    print(f'Staged {name}: {len(data)} bytes', flush=True)
(ROOT / 'sources.json').write_text(json.dumps(manifest, indent=2) + '\n')
