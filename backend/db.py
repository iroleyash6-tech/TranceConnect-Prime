import os
import pymysql
from pymysql.cursors import DictCursor
from dotenv import load_dotenv

# Load environment from current dir or parent dir
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

from urllib.parse import urlparse

def get_db_connection():
    """
    Creates and returns a connection to MySQL using credentials from .env
    or standard cloud connection strings (DATABASE_URL / MYSQL_URL).
    Uses DictCursor for dictionary-like row access.
    """
    database_url = os.getenv('DATABASE_URL') or os.getenv('MYSQL_URL')
    if database_url:
        parsed = urlparse(database_url)
        host = parsed.hostname or 'localhost'
        port = parsed.port or 3306
        user = parsed.username or 'root'
        password = parsed.password or ''
        db_name = parsed.path.lstrip('/') if parsed.path else 'transconnectlinkx'
    else:
        host = os.getenv('DATABASE_HOST') or os.getenv('DB_HOST', 'localhost')
        port = int(os.getenv('DATABASE_PORT') or os.getenv('DB_PORT', 3306))
        user = os.getenv('DATABASE_USER') or os.getenv('DB_USER', 'transconnect')
        password = os.getenv('DATABASE_PASSWORD') or os.getenv('DB_PASSWORD', 'Yash@0024')
        db_name = os.getenv('DATABASE_NAME') or os.getenv('DB_NAME', 'transconnectlinkx')

    connect_kwargs = {
        'host': host,
        'port': port,
        'user': user,
        'password': password,
        'database': db_name,
        'cursorclass': DictCursor,
        'autocommit': True,
        'charset': 'utf8mb4'
    }

    ssl_mode = os.getenv('MYSQL_SSL', '').strip().lower()
    if ssl_mode in ['true', '1', 'required']:
        connect_kwargs['ssl'] = {'ssl_mode': 'REQUIRED'}

    return pymysql.connect(**connect_kwargs)

def test_db_connection():
    """Tests the database connection and returns True or error string."""
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT 1 AS ok")
            res = cur.fetchone()
        conn.close()
        return True, "Connected successfully"
    except Exception as e:
        return False, str(e)
