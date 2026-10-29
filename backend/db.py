import os
import sys
import time
import sqlite3
import pymysql
from pymysql.cursors import DictCursor
from urllib.parse import urlparse
from dotenv import load_dotenv

# Cache for MySQL offline state to prevent blocking delays
_mysql_offline_until = 0

# Load environment configuration
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# SQLite Compatibility Adapter for Tests & Offline Development
class SQLiteCursorWrapper:
    def __init__(self, cursor):
        self.cursor = cursor

    def execute(self, sql, params=None):
        # Convert MySQL %s placeholders to SQLite ? placeholders
        formatted_sql = sql.replace('%s', '?')
        
        # Replace MySQL specific functions if any
        formatted_sql = formatted_sql.replace('NOW()', "datetime('now')")
        formatted_sql = formatted_sql.replace('CURRENT_TIMESTAMP()', "CURRENT_TIMESTAMP")
        formatted_sql = formatted_sql.replace('UNIX_TIMESTAMP()', "strftime('%s', 'now')")

        if params is not None:
            # Handle tuple/list params
            if isinstance(params, (list, tuple)):
                self.cursor.execute(formatted_sql, params)
            else:
                self.cursor.execute(formatted_sql, (params,))
        else:
            self.cursor.execute(formatted_sql)
        return self

    def executemany(self, sql, seq_of_params):
        formatted_sql = sql.replace('%s', '?')
        self.cursor.executemany(formatted_sql, seq_of_params)
        return self

    def fetchone(self):
        row = self.cursor.fetchone()
        if row is None:
            return None
        return dict(row)

    def fetchall(self):
        rows = self.cursor.fetchall()
        return [dict(r) for r in rows]

    @property
    def lastrowid(self):
        return self.cursor.lastrowid

    @property
    def rowcount(self):
        return self.cursor.rowcount

    def close(self):
        self.cursor.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


class SQLiteConnectionWrapper:
    def __init__(self, db_path):
        self.conn = sqlite3.connect(db_path, check_same_thread=False, isolation_level=None)
        self.conn.row_factory = sqlite3.Row
        self._ensure_sqlite_schema()

    def cursor(self):
        return SQLiteCursorWrapper(self.conn.cursor())

    def commit(self):
        self.conn.commit()

    def rollback(self):
        self.conn.rollback()

    def close(self):
        self.conn.close()

    def _ensure_sqlite_schema(self):
        cur = self.conn.cursor()
        cur.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role TEXT NOT NULL,
            company_name TEXT NOT NULL,
            contact_person TEXT,
            mobile TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            gst_number TEXT,
            password_hash TEXT NOT NULL,
            address TEXT,
            city TEXT,
            state TEXT,
            verification_status TEXT DEFAULT 'pending',
            status TEXT DEFAULT 'active',
            fleet_size TEXT,
            operating_routes TEXT,
            vehicle_types TEXT,
            cargo_type TEXT,
            monthly_volume TEXT,
            reset_token TEXT,
            reset_token_expires TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS password_resets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            otp_code TEXT NOT NULL,
            reset_session_token TEXT,
            is_used INTEGER DEFAULT 0,
            attempts INTEGER DEFAULT 0,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS vehicles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transporter_id INTEGER NOT NULL,
            vehicle_number TEXT NOT NULL UNIQUE,
            vehicle_type TEXT NOT NULL,
            capacity_tons REAL NOT NULL,
            rc_document TEXT,
            insurance_document TEXT,
            current_location TEXT,
            status TEXT DEFAULT 'available',
            image_url TEXT DEFAULT '/assets/vehicles/container-truck.svg',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS drivers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transporter_id INTEGER NOT NULL,
            vehicle_id INTEGER,
            name TEXT NOT NULL,
            mobile TEXT NOT NULL,
            license_number TEXT NOT NULL,
            aadhaar_number TEXT,
            license_document TEXT,
            aadhaar_document TEXT,
            status TEXT DEFAULT 'available',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS shipments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dealer_id INTEGER NOT NULL,
            transporter_id INTEGER,
            vehicle_id INTEGER,
            driver_id INTEGER,
            product_type TEXT NOT NULL,
            transport_type TEXT NOT NULL,
            weight_tons REAL NOT NULL,
            vehicle_required TEXT NOT NULL,
            pickup_location TEXT NOT NULL,
            delivery_location TEXT NOT NULL,
            pickup_date TEXT,
            expected_delivery_date TEXT,
            price_per_trip REAL NOT NULL DEFAULT 0.00,
            invoice_document TEXT,
            do_document TEXT,
            status TEXT DEFAULT 'Pending',
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            shipment_id INTEGER,
            vehicle_id INTEGER,
            driver_id INTEGER,
            document_type TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_size INTEGER,
            mime_type TEXT,
            verification_status TEXT DEFAULT 'pending',
            rejection_reason TEXT,
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shipment_id INTEGER NOT NULL,
            sender_id INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL,
            message TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            link TEXT,
            is_read INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS tracking_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shipment_id INTEGER NOT NULL,
            vehicle_id INTEGER,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            location_name TEXT NOT NULL,
            speed_kmh REAL DEFAULT 0.00,
            heading REAL DEFAULT 0.00,
            accuracy REAL DEFAULT 10.00,
            status_note TEXT,
            checkpoint_type TEXT DEFAULT 'corridor',
            recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_number TEXT NOT NULL UNIQUE,
            dealer_id INTEGER NOT NULL,
            shipment_id INTEGER,
            transporter_id INTEGER,
            vehicle_id INTEGER,
            vehicle_number TEXT,
            invoice_date TEXT NOT NULL,
            due_date TEXT,
            place_of_supply TEXT,
            payment_terms TEXT,
            seller_company TEXT NOT NULL,
            seller_address TEXT,
            seller_mobile TEXT,
            seller_email TEXT,
            seller_gst TEXT,
            seller_state TEXT,
            seller_state_code TEXT,
            buyer_name TEXT,
            buyer_company TEXT NOT NULL,
            buyer_address TEXT NOT NULL,
            buyer_shipping_address TEXT,
            buyer_mobile TEXT,
            buyer_email TEXT,
            buyer_gst TEXT,
            buyer_state TEXT,
            buyer_state_code TEXT,
            bank_name TEXT,
            bank_account_no TEXT,
            bank_ifsc TEXT,
            subtotal REAL NOT NULL DEFAULT 0.00,
            discount_amount REAL NOT NULL DEFAULT 0.00,
            taxable_amount REAL NOT NULL DEFAULT 0.00,
            cgst_amount REAL NOT NULL DEFAULT 0.00,
            sgst_amount REAL NOT NULL DEFAULT 0.00,
            igst_amount REAL NOT NULL DEFAULT 0.00,
            total_amount REAL NOT NULL DEFAULT 0.00,
            amount_in_words TEXT,
            notes TEXT,
            terms_conditions TEXT,
            status TEXT NOT NULL DEFAULT 'Draft',
            pdf_path TEXT,
            qr_code_path TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS invoice_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id INTEGER NOT NULL,
            item_name TEXT NOT NULL,
            description TEXT,
            hsn_sac TEXT,
            quantity REAL NOT NULL DEFAULT 1.00,
            unit TEXT NOT NULL DEFAULT 'Tons',
            rate REAL NOT NULL DEFAULT 0.00,
            discount REAL NOT NULL DEFAULT 0.00,
            taxable_value REAL NOT NULL DEFAULT 0.00,
            gst_rate REAL NOT NULL DEFAULT 18.00,
            cgst_amount REAL NOT NULL DEFAULT 0.00,
            sgst_amount REAL NOT NULL DEFAULT 0.00,
            igst_amount REAL NOT NULL DEFAULT 0.00,
            total REAL NOT NULL DEFAULT 0.00,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS delivery_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            do_number TEXT NOT NULL UNIQUE,
            dealer_id INTEGER NOT NULL,
            shipment_id INTEGER,
            transporter_id INTEGER,
            vehicle_id INTEGER,
            driver_id INTEGER,
            do_date TEXT NOT NULL,
            valid_until TEXT,
            consignor_company TEXT NOT NULL,
            consignor_address TEXT,
            consignor_mobile TEXT,
            consignor_email TEXT,
            consignor_gst TEXT,
            consignee_company TEXT NOT NULL,
            consignee_address TEXT NOT NULL,
            consignee_contact TEXT,
            consignee_mobile TEXT,
            consignee_gst TEXT,
            transporter_company TEXT,
            transporter_mobile TEXT,
            transporter_gst TEXT,
            vehicle_number TEXT,
            vehicle_type TEXT,
            driver_name TEXT,
            driver_mobile TEXT,
            driver_license TEXT,
            pickup_location TEXT NOT NULL,
            delivery_location TEXT NOT NULL,
            product_type TEXT NOT NULL,
            total_weight REAL NOT NULL DEFAULT 0.00,
            total_quantity REAL NOT NULL DEFAULT 0.00,
            transport_type TEXT,
            delivery_instructions TEXT,
            handling_instructions TEXT,
            pickup_instructions TEXT,
            special_remarks TEXT,
            authorized_signatory TEXT,
            terms_conditions TEXT,
            status TEXT NOT NULL DEFAULT 'Draft',
            pdf_path TEXT,
            qr_code_path TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS delivery_order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            do_id INTEGER NOT NULL,
            sr_no INTEGER NOT NULL DEFAULT 1,
            product_description TEXT NOT NULL,
            quantity REAL NOT NULL DEFAULT 1.00,
            unit TEXT NOT NULL DEFAULT 'Tons',
            weight REAL NOT NULL DEFAULT 0.00,
            package_type TEXT DEFAULT 'Pallet / Standard',
            remarks TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS document_audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_type TEXT NOT NULL,
            document_id INTEGER NOT NULL,
            document_number TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            details TEXT,
            ip_address TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)
        # Ensure new columns exist on older SQLite databases
        for col, col_type in [('attempts', 'INTEGER DEFAULT 0'), ('reset_session_token', 'TEXT NULL')]:
            try:
                cur.execute(f"ALTER TABLE password_resets ADD COLUMN {col} {col_type}")
            except Exception:
                pass
        for col, col_type in [('heading', 'REAL DEFAULT 0.00'), ('accuracy', 'REAL DEFAULT 10.00'), ('checkpoint_type', 'TEXT DEFAULT "corridor"')]:
            try:
                cur.execute(f"ALTER TABLE tracking_records ADD COLUMN {col} {col_type}")
            except Exception:
                pass
        for col, col_type in [('image_url', 'TEXT DEFAULT "/assets/vehicles/container-truck.svg"')]:
            try:
                cur.execute(f"ALTER TABLE vehicles ADD COLUMN {col} {col_type}")
            except Exception:
                pass
        for col, col_type in [
            ('storage_provider', 'TEXT DEFAULT "local"'),
            ('storage_bucket', 'TEXT DEFAULT "transconnect-2fb2b.firebasestorage.app"'),
            ('storage_path', 'TEXT NULL')
        ]:
            try:
                cur.execute(f"ALTER TABLE documents ADD COLUMN {col} {col_type}")
            except Exception:
                pass
        self.conn.commit()


def get_sqlite_fallback():
    """Returns a resilient SQLite connection for testing and local fallback."""
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    if os.getenv('VERCEL') or os.getenv('AWS_LAMBDA_FUNCTION_NAME'):
        db_path = '/tmp/tranceconnect_local.sqlite'
        src_path = os.path.join(base_dir, 'database', 'tranceconnect_local.sqlite')
        if not os.path.exists(db_path) and os.path.exists(src_path):
            try:
                import shutil
                shutil.copyfile(src_path, db_path)
            except Exception:
                pass
    else:
        db_path = os.getenv('SQLITE_DB_PATH') or os.path.join(base_dir, 'database', 'tranceconnect_local.sqlite')
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    return SQLiteConnectionWrapper(db_path)


def get_db_connection():
    """
    Creates and returns a connection to MySQL using credentials from .env
    or standard cloud connection strings (DATABASE_URL / MYSQL_URL).
    Falls back gracefully to SQLite when DB_TYPE=sqlite or TESTING=true or when MySQL is unavailable.
    """
    global _mysql_offline_until
    db_type = (os.getenv('DB_TYPE') or '').lower().strip()
    is_testing = os.getenv('TESTING', '').lower() in ['true', '1', 'yes']

    if db_type == 'sqlite' or is_testing:
        return get_sqlite_fallback()

    allow_fallback = os.getenv('ALLOW_SQLITE_FALLBACK', 'true').lower() in ['true', '1', 'yes']
    if allow_fallback and time.time() < _mysql_offline_until:
        return get_sqlite_fallback()

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
        user = os.getenv('DATABASE_USER') or os.getenv('DB_USER', 'root')
        password = os.getenv('DATABASE_PASSWORD') or os.getenv('DB_PASSWORD', '')
        db_name = os.getenv('DATABASE_NAME') or os.getenv('DB_NAME', 'transconnectlinkx')

    connect_kwargs = {
        'host': host,
        'port': port,
        'user': user,
        'password': password,
        'database': db_name,
        'cursorclass': DictCursor,
        'autocommit': True,
        'charset': 'utf8mb4',
        'connect_timeout': 3
    }

    ssl_mode = os.getenv('MYSQL_SSL', '').strip().lower()
    if ssl_mode in ['true', '1', 'required']:
        connect_kwargs['ssl'] = {'ssl_mode': 'REQUIRED'}

    try:
        conn = pymysql.connect(**connect_kwargs)
        _mysql_offline_until = 0
        return conn
    except Exception as e:
        if allow_fallback:
            _mysql_offline_until = time.time() + 60
            return get_sqlite_fallback()
        raise e


def test_db_connection():
    """Tests the database connection and returns (True, message) or (False, error)."""
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT 1 AS ok")
            res = cur.fetchone()
        conn.close()
        engine = "SQLite Local Engine" if isinstance(conn, SQLiteConnectionWrapper) else "Production MySQL Engine"
        return True, f"Connected successfully ({engine})"
    except Exception as e:
        return False, str(e)
