import sys
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from backend.db import get_db_connection

def run_migration():
    print("Starting schema upgrade v2...")
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # 1. Update shipments.status column to VARCHAR(50) to support all logistics lifecycle milestones
            print("Upgrading shipments.status column...")
            cur.execute("ALTER TABLE shipments MODIFY COLUMN status VARCHAR(50) DEFAULT 'Pending'")

            # 2. Add transporter and dealer business profile columns to users table
            print("Checking users table columns...")
            cur.execute("DESCRIBE users")
            existing_user_cols = [r['Field'] for r in cur.fetchall()]

            new_user_cols = [
                ("fleet_size", "VARCHAR(50) NULL"),
                ("operating_routes", "TEXT NULL"),
                ("vehicle_types", "TEXT NULL"),
                ("cargo_type", "VARCHAR(100) NULL"),
                ("monthly_volume", "VARCHAR(100) NULL"),
                ("reset_token", "VARCHAR(128) NULL"),
                ("reset_token_expires", "DATETIME NULL")
            ]

            for col_name, col_def in new_user_cols:
                if col_name not in existing_user_cols:
                    print(f"Adding users.{col_name}...")
                    cur.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_def}")

            # 3. Ensure tracking_records has checkpoint_type & eta
            cur.execute("DESCRIBE tracking_records")
            existing_track_cols = [r['Field'] for r in cur.fetchall()]
            if 'checkpoint_type' not in existing_track_cols:
                print("Adding tracking_records.checkpoint_type...")
                cur.execute("ALTER TABLE tracking_records ADD COLUMN checkpoint_type VARCHAR(50) DEFAULT 'corridor'")

            conn.commit()
            print("✓ Schema upgrade v2 completed successfully!")
    finally:
        conn.close()

if __name__ == "__main__":
    run_migration()
