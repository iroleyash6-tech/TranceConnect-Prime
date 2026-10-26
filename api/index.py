import os
import sys
import shutil

# Add project root to sys.path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

# Auto-configure fallback environment for Vercel Serverless
if not os.getenv('MYSQL_HOST'):
    os.environ['DB_TYPE'] = 'sqlite'
    # Vercel serverless filesystem is read-only outside of /tmp
    tmp_db = os.path.join('/tmp', 'tranceconnect_local.sqlite')
    orig_db = os.path.join(BASE_DIR, 'database', 'tranceconnect_local.sqlite')
    if not os.path.exists(tmp_db) and os.path.exists(orig_db):
        try:
            shutil.copy2(orig_db, tmp_db)
        except Exception:
            pass
    if os.path.exists('/tmp'):
        os.environ['SQLITE_DB_PATH'] = tmp_db

from backend.app import app

# Export for Vercel Python WSGI runtime
handler = app
