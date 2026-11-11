import os
from pathlib import Path


DEFAULT_DATA_DIR = Path(__file__).resolve().parents[2] / 'data'
DATA_DIR = Path(os.environ.get('DATA_DIR', str(DEFAULT_DATA_DIR))).expanduser()
if not DATA_DIR.is_absolute():
    DATA_DIR = DEFAULT_DATA_DIR.parent / DATA_DIR
DATA_DIR = DATA_DIR.resolve()

TEMPLATE_DIR = DATA_DIR / 'templates'
GENERATED_DIR = DATA_DIR / 'generated'
ATTACHMENTS_DIR = DATA_DIR / 'attachments'
DB_PATH = DATA_DIR / 'docufill.db'

for directory in (DATA_DIR, TEMPLATE_DIR, GENERATED_DIR, ATTACHMENTS_DIR):
    directory.mkdir(parents=True, exist_ok=True)

CORS_ORIGINS = [
    origin.strip()
    for origin in os.environ.get('CORS_ORIGINS', '*').split(',')
    if origin.strip()
]

MAX_UPLOAD_MB = int(os.environ.get('MAX_UPLOAD_MB', '10'))
if MAX_UPLOAD_MB < 1:
    raise ValueError('MAX_UPLOAD_MB must be a positive integer')
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
