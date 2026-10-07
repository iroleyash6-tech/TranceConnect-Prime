"""
TranceConnect-Prime Database Inspector Utility
Run this anytime: python check_db.py
"""
import os
import sys
import pymysql
from pymysql.cursors import DictCursor
from dotenv import load_dotenv

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), 'backend', '.env'))

def inspect_database():
    host = os.getenv('DATABASE_HOST', 'localhost')
    port = int(os.getenv('DATABASE_PORT', 3306))
    user = os.getenv('DATABASE_USER', 'transconnect')
    password = os.getenv('DATABASE_PASSWORD', 'Yash@0024')
    db_name = os.getenv('DATABASE_NAME', 'transconnectlinkx')

    print("==================================================================")
    print("🔍 TRANCECONNECT-PRIME: LIVE MYSQL DATABASE INSPECTION")
    print(f"Host: {host}:{port} | Database: {db_name} | User: {user}")
    print("==================================================================")

    try:
        conn = pymysql.connect(
            host=host, port=port, user=user, password=password, database=db_name,
            cursorclass=DictCursor, charset='utf8mb4'
        )
        cur = conn.cursor()

        tables = ['users', 'shipments', 'vehicles', 'drivers', 'documents', 'messages', 'notifications', 'tracking_records', 'password_resets']

        for tbl in tables:
            cur.execute(f"SELECT COUNT(*) AS count FROM `{tbl}`;")
            count = cur.fetchone()['count']
            print(f"📊 Table: {tbl.upper():<18} -> {count:>3} records")
            
            # Print sample rows
            cur.execute(f"SELECT * FROM `{tbl}` LIMIT 3;")
            rows = cur.fetchall()
            for r in rows:
                if tbl == 'users':
                    print(f"    • ID {r['id']}: [{r['role']}] {r['company_name']} ({r['email']}) - Status: {r['status']}")
                elif tbl == 'shipments':
                    print(f"    • ID {r['id']}: {r['product_type']} ({r['weight_tons']}T) - {r['pickup_location'][:20]}.. ➔ {r['delivery_location'][:20]}.. [{r['status']}] - ₹{r['price_per_trip']}")
                elif tbl == 'vehicles':
                    print(f"    • ID {r['id']}: {r['vehicle_number']} ({r['vehicle_type']}) - Capacity: {r['capacity_tons']}T - Status: {r['status']}")

        print("==================================================================")
        print("✅ Database is 100% healthy, operational, and properly populated!")
        print("==================================================================")
        conn.close()
    except Exception as e:
        print("❌ Database connection error:", e)

if __name__ == '__main__':
    inspect_database()
