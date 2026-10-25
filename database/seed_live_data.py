import os
import sys
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash

# Ensure root directory is on path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from backend.db import get_db_connection

def seed_database():
    conn = get_db_connection()
    cur = conn.cursor()

    pwd_hash = generate_password_hash('Pass@123456')
    admin_pwd_hash = generate_password_hash('Admin@123456')

    # 1. Admin Account
    cur.execute("SELECT id FROM users WHERE email = %s", ('admin@tranceconnect.com',))
    row = cur.fetchone()
    if not row:
        cur.execute("""
            INSERT INTO users (role, company_name, contact_person, mobile, email, gst_number, password_hash, verification_status, status)
            VALUES ('admin', 'TranceConnect HQ Control', 'System Administrator', '9876543210', 'admin@tranceconnect.com', '27AAAAA0000A1Z5', %s, 'verified', 'active')
        """, (admin_pwd_hash,))
    else:
        cur.execute("""
            UPDATE users SET role='admin', password_hash=%s, verification_status='verified', status='active' WHERE email=%s
        """, (admin_pwd_hash, 'admin@tranceconnect.com'))

    # 2. Transporter Accounts
    transporters = [
        ('Apex Logistics & Freight Corp', 'Rajesh Sharma', '9822011223', 'transporter@tranceconnect.com', '27AABCT1234F1Z8', 'Bhiwandi Warehousing Zone', 'Mumbai', 'Maharashtra'),
        ('SpeedRoad Express Carriers', 'Amit Patil', '9890123456', 'speedfreight@tranceconnect.com', '27AABCS5678G1Z2', 'Chakan Auto Hub Phase 2', 'Pune', 'Maharashtra'),
        ('Mahalaxmi Heavy Haulers', 'Sanjay Rathore', '9820554433', 'mahalaxmi@tranceconnect.com', '27AAECM9988H1ZT', 'JNPT CFS Terminal', 'Navi Mumbai', 'Maharashtra'),
        ('Gujarat Western Carriers', 'Pravin Patel', '9825123456', 'western@tranceconnect.com', '24AABCG1122D1Z9', 'GIDC Industrial Estate', 'Surat', 'Gujarat'),
        ('Southern Roadlines Ltd', 'K. Murugan', '9840123456', 'southern@tranceconnect.com', '33AABCS4455E1Z3', 'Ambattur Industrial Estate', 'Chennai', 'Tamil Nadu')
    ]

    for t in transporters:
        cur.execute("SELECT id FROM users WHERE email = %s", (t[3],))
        if not cur.fetchone():
            cur.execute("""
                INSERT INTO users (role, company_name, contact_person, mobile, email, gst_number, password_hash, address, city, state, verification_status, status)
                VALUES ('transporter', %s, %s, %s, %s, %s, %s, %s, %s, %s, 'verified', 'active')
            """, (t[0], t[1], t[2], t[3], t[4], pwd_hash, t[5], t[6], t[7]))
        else:
            cur.execute("UPDATE users SET password_hash = %s, verification_status = 'verified', status = 'active' WHERE email = %s", (pwd_hash, t[3]))

    # 3. Dealer Accounts
    dealers = [
        ('Bharat Steel & Infrastructure Ltd', 'Vikram Mehta', '9819876543', 'dealer@tranceconnect.com', '27AAACB2345M1ZV', 'Kalamboli Steel Market', 'Navi Mumbai', 'Maharashtra'),
        ('Kirloskar Industrial Machinery Corp', 'Anand Kirloskar', '9823112244', 'kirloskar@tranceconnect.com', '27AAACK1122K1Z4', 'Hadapsar Industrial Estate', 'Pune', 'Maharashtra'),
        ('Godrej Commodities & Agrovet', 'Sunil Deshmukh', '9821445566', 'agrovet@tranceconnect.com', '27AAACG3344J1Z7', 'Vikhroli West Logistics Park', 'Mumbai', 'Maharashtra')
    ]

    for d in dealers:
        cur.execute("SELECT id FROM users WHERE email = %s", (d[3],))
        if not cur.fetchone():
            cur.execute("""
                INSERT INTO users (role, company_name, contact_person, mobile, email, gst_number, password_hash, address, city, state, verification_status, status)
                VALUES ('dealer', %s, %s, %s, %s, %s, %s, %s, %s, %s, 'verified', 'active')
            """, (d[0], d[1], d[2], d[3], d[4], pwd_hash, d[5], d[6], d[7]))
        else:
            cur.execute("UPDATE users SET password_hash = %s, verification_status = 'verified', status = 'active' WHERE email = %s", (pwd_hash, d[3]))

    # Map Emails to IDs
    cur.execute("SELECT id, email FROM users WHERE role = 'transporter';")
    t_rows = cur.fetchall()
    t_map = {r['email']: r['id'] for r in t_rows}

    cur.execute("SELECT id, email FROM users WHERE role = 'dealer';")
    d_rows = cur.fetchall()
    d_map = {r['email']: r['id'] for r in d_rows}

    t_apex = t_map.get('transporter@tranceconnect.com')
    t_speed = t_map.get('speedfreight@tranceconnect.com')
    d_bharat = d_map.get('dealer@tranceconnect.com')

    # 4. Fleet Vehicles
    if t_apex:
        vehicles = [
            (t_apex, 'MH-04-AB-1234', '32ft Multi-Axle Truck (MXL)', 25.0, 'available', 'Bhiwandi Warehousing Hub, Mumbai'),
            (t_apex, 'MH-04-CD-5678', '20ft Container Truck', 15.0, 'in_transit', 'Mumbai-Pune Expressway (Km 42)'),
            (t_apex, 'MH-04-EF-9012', '14ft Open Body Truck', 8.5, 'available', 'JNPT Port Container Gate 3')
        ]
        if t_speed:
            vehicles.extend([
                (t_speed, 'MH-12-GH-3456', '32ft Multi-Axle Truck (MXL)', 26.0, 'available', 'Chakan MIDC Phase 2, Pune'),
                (t_speed, 'MH-12-JK-7890', '40ft Heavy Flatbed Trailer', 35.0, 'available', 'Talegaon Industrial Hub, Pune'),
                (t_speed, 'MH-12-LM-1122', '17ft Closed Container', 9.0, 'available', 'Lonavala Expressway Corridor')
            ])

        for v in vehicles:
            cur.execute("SELECT id FROM vehicles WHERE vehicle_number = %s", (v[1],))
            if not cur.fetchone():
                cur.execute("""
                    INSERT INTO vehicles (transporter_id, vehicle_number, vehicle_type, capacity_tons, status, current_location)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, v)

    # 5. Drivers
    if t_apex:
        cur.execute("SELECT id, vehicle_number FROM vehicles WHERE transporter_id = %s;", (t_apex,))
        v_rows = cur.fetchall()
        v1_id = v_rows[0]['id'] if len(v_rows) > 0 else None
        v2_id = v_rows[1]['id'] if len(v_rows) > 1 else None

        drivers = [
            (t_apex, v1_id, 'Ramesh Yadav', '9870011223', 'MH0420180012345', '123456789012', 'available'),
            (t_apex, v2_id, 'Suresh Kadam', '9870011224', 'MH0420190054321', '234567890123', 'assigned'),
            (t_speed or t_apex, None, 'Mahesh Shinde', '9890011226', 'MH1220170067890', '456789012345', 'available')
        ]

        for dr in drivers:
            cur.execute("SELECT id FROM drivers WHERE license_number = %s", (dr[4],))
            if not cur.fetchone():
                cur.execute("""
                    INSERT INTO drivers (transporter_id, vehicle_id, name, mobile, license_number, aadhaar_number, status)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, dr)

    # 6. Sample Shipments
    if d_bharat and t_apex:
        cur.execute("SELECT COUNT(*) AS c FROM shipments WHERE dealer_id = %s;", (d_bharat,))
        count_row = cur.fetchone()
        c = count_row['c'] if count_row else 0
        if c < 3:
            cur.execute("""
                INSERT INTO shipments (dealer_id, transporter_id, vehicle_id, product_type, transport_type, weight_tons, vehicle_required, pickup_location, delivery_location, price_per_trip, status, notes)
                VALUES (%s, %s, %s, 'Cold Rolled Steel Coils', 'Full Truckload (FTL)', 18.5, '32ft Multi-Axle Truck (MXL)', 'JNPT Container Terminal, Navi Mumbai', 'Bhosari MIDC, Pune', 34500.00, 'In Transit', 'Driver Suresh Kadam navigating expressway')
            """, (d_bharat, t_apex, v2_id))
            ship1_id = cur.lastrowid

            cur.execute("""
                INSERT INTO shipments (dealer_id, transporter_id, vehicle_id, product_type, transport_type, weight_tons, vehicle_required, pickup_location, delivery_location, price_per_trip, status, notes)
                VALUES (%s, %s, %s, 'Structural Steel Angles & Beams', 'Full Truckload (FTL)', 24.0, '32ft Multi-Axle Truck (MXL)', 'Kalamboli Steel Yard, Navi Mumbai', 'Chakan Auto Cluster, Pune', 39000.00, 'Accepted', 'Transporter accepted. Loading scheduled tomorrow 8:00 AM')
            """, (d_bharat, t_apex, v1_id))

            cur.execute("""
                INSERT INTO shipments (dealer_id, transporter_id, product_type, transport_type, weight_tons, vehicle_required, pickup_location, delivery_location, price_per_trip, status, notes)
                VALUES (%s, %s, 'Galvanized Corrugated Sheets', 'Full Truckload (FTL)', 15.0, '24ft Container', 'Taloja Industrial MIDC, Navi Mumbai', 'GIDC Estate, Vapi, Gujarat', 28000.00, 'Pending', 'Open to all verified transporters')
            """, (d_bharat, t_apex))

            # Telemetry record for the in-transit shipment
            cur.execute("""
                INSERT INTO tracking_records (shipment_id, vehicle_id, latitude, longitude, location_name, speed_kmh, status_note, checkpoint_type)
                VALUES (%s, %s, 18.7533, 73.4072, 'Khandala Ghat Checkpoint, Mumbai-Pune Expressway', 52.0, 'Live GPS telemetry streaming active', 'corridor')
            """, (ship1_id, v2_id))

            # Sample messages
            cur.execute("""
                INSERT INTO messages (shipment_id, sender_id, receiver_id, message)
                VALUES (%s, %s, %s, 'Good morning. Consignment loaded at JNPT dock 4. E-Way bill uploaded.')
            """, (ship1_id, d_bharat, t_apex))

            cur.execute("""
                INSERT INTO messages (shipment_id, sender_id, receiver_id, message)
                VALUES (%s, %s, %s, 'Acknowledged. Driver Suresh has toll fastag active. Unloading dock 2 ready at Pune.')
            """, (ship1_id, t_apex, d_bharat))

    conn.commit()
    conn.close()
    print("Database operational seed completed successfully!")

if __name__ == "__main__":
    seed_database()
