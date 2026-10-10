import os
import sys
import uuid
import datetime
import random
import re
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

# Ensure root and backend directories are in python path
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.abspath(os.path.join(current_dir, '..'))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from flask import Flask, jsonify, request, send_from_directory, abort
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

try:
    from backend.db import get_db_connection, test_db_connection
    from backend.auth_util import (
        hash_password, verify_password, create_access_token, decode_access_token,
        token_required, role_required
    )
    from backend.ai_service import get_logistics_ai_reply
    from backend.invoice_do_routes import invoice_do_bp
except ImportError:
    from db import get_db_connection, test_db_connection
    from auth_util import (
        hash_password, verify_password, create_access_token, decode_access_token,
        token_required, role_required
    )
    from ai_service import get_logistics_ai_reply
    from invoice_do_routes import invoice_do_bp

# Load environment variables
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# Paths
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
FRONTEND_DIR = os.path.join(BASE_DIR, 'frontend')
ASSETS_DIR = os.path.join(BASE_DIR, 'assets')
UPLOAD_DIR = os.path.join(BASE_DIR, 'uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(os.path.join(UPLOAD_DIR, 'documents'), exist_ok=True)

ALLOWED_EXTENSIONS = {'pdf', 'png', 'jpg', 'jpeg', 'webp', 'doc', 'docx'}
MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 MB

app = Flask(
    __name__,
    static_folder=FRONTEND_DIR,
    static_url_path=''
)
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH
CORS(app)

# Register Document (Invoice & DO) Blueprint
app.register_blueprint(invoice_do_bp)

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="threading"
)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_default_vehicle_image(v_type):
    v = (v_type or "").lower()
    if 'container' in v:
        return '/assets/vehicles/container-truck.svg'
    elif 'closed' in v or 'box' in v or 'sealed' in v:
        return '/assets/vehicles/closed-truck.svg'
    elif 'open' in v or 'flatbed' in v or 'dropside' in v:
        return '/assets/vehicles/open-body-truck.svg'
    elif 'trailer' in v:
        return '/assets/vehicles/trailer-truck.svg'
    elif 'pickup' in v or 'small' in v or 'lcv' in v:
        return '/assets/vehicles/pickup-truck.svg'
    elif 'heavy' in v or 'tipper' in v or 'multi-axle' in v or '14' in v or 'dump' in v:
        return '/assets/vehicles/heavy-commercial.svg'
    elif 'delivery' in v or 'van' in v:
        return '/assets/vehicles/delivery-van.svg'
    return '/assets/vehicles/container-truck.svg'


# ==========================================
# 1. FRONTEND & STATIC ROUTES
# ==========================================

@app.route('/')
@app.route('/login')
@app.route('/register')
def index():
    """Serves the main landing page and authentication entrypoint."""
    return send_from_directory(FRONTEND_DIR, 'index.html')

@app.route('/dealer')
@app.route('/shipments')
@app.route('/invoices')
@app.route('/delivery-orders')
def dealer_page():
    """Serves the dedicated live Dealer / Shipper Dashboard."""
    return send_from_directory(FRONTEND_DIR, 'dealer.html')

@app.route('/transporter')
def transporter_page():
    """Serves the dedicated live Transporter / Fleet Dashboard."""
    return send_from_directory(FRONTEND_DIR, 'transporter.html')

@app.route('/admin')
def admin_page():
    """Serves the dedicated live Platform Administrator Dashboard."""
    return send_from_directory(FRONTEND_DIR, 'admin.html')

@app.route('/verify/invoice/<path:inv_number>')
def verify_invoice_page(inv_number):
    """Serves the public QR verification page for Tax Invoices."""
    return send_from_directory(FRONTEND_DIR, 'verify.html')

@app.route('/verify/do/<path:do_number>')
def verify_do_page(do_number):
    """Serves the public QR verification page for Delivery Orders."""
    return send_from_directory(FRONTEND_DIR, 'verify.html')

@app.route('/assets/<path:filename>')
def serve_assets(filename):
    """Serves media assets."""
    if os.path.exists(os.path.join(ASSETS_DIR, filename)):
        return send_from_directory(ASSETS_DIR, filename)
    abort(404)


# ==========================================
# 2. HEALTH CHECK & SYSTEM DIAGNOSTICS
# ==========================================

@app.get("/api/health")
def health():
    db_ok, db_msg = test_db_connection()
    return jsonify({
        "status": "healthy" if db_ok else "database_error",
        "project": "TranceConnect-Prime",
        "service": "Production API Server",
        "database": {
            "connected": db_ok,
            "message": db_msg
        },
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "version": "2.4.0"
    }), 200 if db_ok else 500


# ==========================================
# 3. EMAIL NOTIFICATION & AUTHENTICATION APIS
# ==========================================

def send_email_notification(to_email, subject, body_text, body_html=None):
    """
    Sends email notification via SMTP if configured in .env.
    Returns (True, message) or (False, reason).
    """
    smtp_host = os.getenv('SMTP_HOST', '').strip()
    smtp_port = int(os.getenv('SMTP_PORT', 587))
    smtp_user = os.getenv('SMTP_USER', '').strip()
    smtp_pass = os.getenv('SMTP_PASSWORD', '').strip()
    smtp_from = os.getenv('SMTP_FROM', 'noreply@tranceconnect.com').strip()
    use_tls = os.getenv('SMTP_USE_TLS', 'true').lower() in ['true', '1', 'yes']

    if not smtp_host or not smtp_user or not smtp_pass:
        return False, "SMTP server not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD in .env."

    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = smtp_from
        msg['To'] = to_email
        msg.attach(MIMEText(body_text, 'plain', 'utf-8'))
        if body_html:
            msg.attach(MIMEText(body_html, 'html', 'utf-8'))

        if smtp_port == 465:
            with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=10) as server:
                server.login(smtp_user, smtp_pass)
                server.sendmail(smtp_from, [to_email], msg.as_string())
        else:
            with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
                if use_tls:
                    server.starttls()
                server.login(smtp_user, smtp_pass)
                server.sendmail(smtp_from, [to_email], msg.as_string())
        return True, "Email sent successfully"
    except Exception as e:
        print(f"[SMTP Error] {e}")
        return False, f"Failed to send email via SMTP: {str(e)}"


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    role = data.get("role", "").strip().lower()
    company_name = data.get("company_name", "").strip()
    contact_person = data.get("contact_person", "").strip()
    mobile = data.get("mobile", "").strip()
    email = data.get("email", "").strip().lower()
    gst_number = data.get("gst_number", "").strip().upper()
    password = data.get("password", "").strip()
    confirm_password = data.get("confirm_password", "").strip()
    city = data.get("city", "").strip()
    state = data.get("state", "").strip()
    address = data.get("address", "").strip()

    # Role specific profile
    fleet_size = data.get("fleet_size", "").strip()
    operating_routes = data.get("operating_routes", "").strip()
    vehicle_types = data.get("vehicle_types", "").strip()
    cargo_type = data.get("cargo_type", "").strip()
    monthly_volume = data.get("monthly_volume", "").strip()

    # 1. Role validation
    if not role or role not in ['dealer', 'transporter']:
        return jsonify({"error": "Please select your account type: Dealer (Shipper) or Transporter (Fleet Carrier).", "field": "role"}), 400

    # 2. Company Name validation
    if not company_name:
        return jsonify({"error": "Company name is required. Enter your registered business name or transport firm name.", "field": "company_name"}), 400
    if len(company_name) < 2:
        return jsonify({"error": "Company name must contain at least 2 characters.", "field": "company_name"}), 400

    # 3. Mobile Number validation (Indian 10-digit mobile)
    clean_mobile = re.sub(r'[\s\-\+\(\)]', '', mobile)
    if clean_mobile.startswith('91') and len(clean_mobile) == 12:
        clean_mobile = clean_mobile[2:]
    if clean_mobile.startswith('0') and len(clean_mobile) == 11:
        clean_mobile = clean_mobile[1:]

    if not clean_mobile or len(clean_mobile) != 10 or clean_mobile[0] not in '6789':
        return jsonify({
            "error": "Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9 (e.g. 9820123456).",
            "field": "mobile"
        }), 400

    # 4. Email validation
    email_regex = r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$'
    if not email or not re.match(email_regex, email):
        return jsonify({
            "error": "Enter a valid email address in the format name@example.com.",
            "field": "email"
        }), 400

    # 5. GSTIN format validation (Optional, but if entered must match format)
    if gst_number:
        gst_regex = r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'
        if not re.match(gst_regex, gst_number):
            return jsonify({
                "error": "GSTIN must contain 15 characters (e.g. 27AAAAA0000A1Z5). Please verify your GST registration number or leave blank if unregistered.",
                "field": "gst_number"
            }), 400

    # 6. Password validation & Confirm Password match
    if not password or len(password) < 6:
        return jsonify({
            "error": "Password must be at least 6 characters long and meet the security requirements.",
            "field": "password"
        }), 400

    if confirm_password and confirm_password != password:
        return jsonify({
            "error": "Your passwords do not match. Re-enter your confirmation password.",
            "field": "confirm_password"
        }), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Check existing email
            cur.execute("SELECT id FROM users WHERE email = %s", (email,))
            if cur.fetchone():
                return jsonify({
                    "error": "This email is already registered. Please log in or reset your password.",
                    "field": "email",
                    "code": "EMAIL_ALREADY_EXISTS"
                }), 409

            # Check existing mobile
            cur.execute("SELECT id FROM users WHERE mobile = %s", (clean_mobile,))
            if cur.fetchone():
                return jsonify({
                    "error": "This mobile number is already registered with another account. Please use another number or log in.",
                    "field": "mobile",
                    "code": "MOBILE_ALREADY_EXISTS"
                }), 409

            pwd_hash = hash_password(password)
            cur.execute("""
                INSERT INTO users (
                    role, company_name, contact_person, mobile, email, gst_number,
                    password_hash, address, city, state, verification_status, status,
                    fleet_size, operating_routes, vehicle_types, cargo_type, monthly_volume
                ) VALUES (
                    %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, 'pending', 'active',
                    %s, %s, %s, %s, %s
                )
            """, (
                role, company_name, contact_person or company_name, clean_mobile, email, gst_number or None,
                pwd_hash, address or None, city or None, state or None,
                fleet_size or None, operating_routes or None, vehicle_types or None, cargo_type or None, monthly_volume or None
            ))
            user_id = cur.lastrowid

            # Create welcome in-app notification
            role_label = "Shipper / Consignor" if role == 'dealer' else "Logistics Transporter"
            cur.execute("""
                INSERT INTO notifications (user_id, title, message)
                VALUES (%s, %s, %s)
            """, (
                user_id,
                f"Welcome to TranceConnect-Prime!",
                f"Your business account as {role_label} has been registered successfully. Explore your dashboard to manage consignments."
            ))

        token = create_access_token(user_id, role, email)
        return jsonify({
            "message": f"Successfully registered as {role_label}! Welcome to TranceConnect-Prime.",
            "token": token,
            "user": {
                "id": user_id,
                "role": role,
                "company_name": company_name,
                "contact_person": contact_person or company_name,
                "email": email,
                "mobile": clean_mobile,
                "gst_number": gst_number,
                "city": city,
                "state": state,
                "verification_status": "pending",
                "status": "active"
            }
        }), 201
    except Exception as e:
        return jsonify({"error": f"Registration failed: {str(e)}"}), 500
    finally:
        conn.close()


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    identifier = (data.get("email") or data.get("identifier") or "").strip().lower()
    password = data.get("password", "").strip()

    if not identifier or not password:
        return jsonify({"error": "Please enter your registered email address or mobile number and password."}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Allow login via either email or 10-digit mobile number
            clean_mobile = re.sub(r'[\s\-\+\(\)]', '', identifier)
            if clean_mobile.startswith('91') and len(clean_mobile) == 12:
                clean_mobile = clean_mobile[2:]

            cur.execute("""
                SELECT id, role, company_name, contact_person, mobile, email, gst_number, password_hash, verification_status, status
                FROM users WHERE email = %s OR mobile = %s
            """, (identifier, clean_mobile))
            user = cur.fetchone()

        if not user or not verify_password(password, user['password_hash']):
            return jsonify({"error": "Invalid login credentials. Please check your email/mobile and password, or use Forgot Password."}), 401

        if user['status'] == 'blocked':
            return jsonify({"error": "Your account has been suspended by administration. Please contact support."}), 403

        token = create_access_token(user['id'], user['role'], user['email'])
        del user['password_hash']

        return jsonify({
            "message": "Login successful",
            "token": token,
            "user": user
        }), 200
    except Exception as e:
        return jsonify({"error": f"Login failed: {str(e)}"}), 500
    finally:
        conn.close()


@app.get("/api/auth/me")
@token_required
def get_current_user_profile(current_user):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, role, company_name, contact_person, mobile, email, gst_number, address, city, state, verification_status, status, created_at
                FROM users WHERE id = %s
            """, (current_user['id'],))
            user = cur.fetchone()

        if not user:
            return jsonify({"error": "User not found"}), 404
        return jsonify({"user": user}), 200
    finally:
        conn.close()


@app.put("/api/auth/profile")
@token_required
def update_user_profile(current_user):
    data = request.get_json(silent=True) or {}
    company_name = data.get("company_name", "").strip()
    contact_person = data.get("contact_person", "").strip()
    mobile = data.get("mobile", "").strip()
    gst_number = data.get("gst_number", "").strip().upper()
    address = data.get("address", "").strip()
    city = data.get("city", "").strip()
    state = data.get("state", "").strip()

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE users SET
                    company_name = COALESCE(NULLIF(%s, ''), company_name),
                    contact_person = COALESCE(NULLIF(%s, ''), contact_person),
                    mobile = COALESCE(NULLIF(%s, ''), mobile),
                    gst_number = COALESCE(NULLIF(%s, ''), gst_number),
                    address = %s,
                    city = %s,
                    state = %s
                WHERE id = %s
            """, (company_name, contact_person, mobile, gst_number, address, city, state, current_user['id']))
        return jsonify({"message": "Profile updated successfully"}), 200
    finally:
        conn.close()


# ==========================================
# 4. FORGOT PASSWORD & RECOVERY SYSTEM
# ==========================================

@app.post("/api/auth/forgot-password")
def forgot_password():
    data = request.get_json(silent=True) or {}
    email = data.get("email", "").strip().lower()
    if not email:
        return jsonify({"error": "Please enter your registered email address.", "field": "email"}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, company_name, contact_person FROM users WHERE email = %s", (email,))
            user = cur.fetchone()
            if not user:
                return jsonify({
                    "error": "No registered account found with this email address. Please check for spelling mistakes or create a new account.",
                    "field": "email"
                }), 404

            # Rate-limiting: prevent spam if requested in last 60 seconds
            cur.execute("""
                SELECT created_at FROM password_resets 
                WHERE email = %s AND created_at > (NOW() - INTERVAL 60 SECOND)
                ORDER BY id DESC LIMIT 1
            """, (email,))
            if cur.fetchone():
                return jsonify({
                    "error": "A password reset code was recently sent. Please check your inbox or wait 60 seconds before requesting a new code."
                }), 429

            # Generate secure random single-use numeric 6-digit OTP and alphanumeric reset token
            otp = f"{random.randint(100000, 999999)}"
            reset_token = uuid.uuid4().hex + uuid.uuid4().hex
            expires_at = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=15)

            cur.execute("""
                INSERT INTO password_resets (email, otp_code, expires_at)
                VALUES (%s, %s, %s)
            """, (email, otp, expires_at))

            # Store reset token on user record
            cur.execute("""
                UPDATE users SET reset_token = %s, reset_token_expires = %s WHERE id = %s
            """, (reset_token, expires_at, user['id']))

        # Send email if SMTP is configured
        email_subject = "TranceConnect-Prime: Password Recovery Code"
        email_body = f"""Hello {user['contact_person'] or user['company_name']},

We received a request to reset your password for your TranceConnect-Prime account ({email}).

Your 6-Digit Password Reset OTP Code: {otp}

This code is valid for 15 minutes. If you did not request this, please ignore this email.

Best regards,
The TranceConnect Logistics Security Team
"""
        email_html = f"""
        <div style="font-family: Arial, sans-serif; background: #070d18; color: #e2e8f0; padding: 2rem; border-radius: 8px;">
          <h2 style="color: #38bdf8;">TranceConnect-Prime Security</h2>
          <p>Hello <strong>{user['contact_person'] or user['company_name']}</strong>,</p>
          <p>We received a request to reset your password for account <code>{email}</code>.</p>
          <div style="background: #0f172a; border: 1px solid #0ea5e9; padding: 1.25rem; border-radius: 6px; text-align: center; margin: 1.5rem 0;">
            <span style="font-size: 0.85rem; color: #94a3b8; letter-spacing: 1px; display: block; margin-bottom: 0.5rem;">YOUR VERIFICATION CODE</span>
            <span style="font-size: 2rem; font-weight: bold; letter-spacing: 6px; color: #38bdf8; font-family: monospace;">{otp}</span>
          </div>
          <p style="color: #94a3b8; font-size: 0.85rem;">This OTP expires in 15 minutes. Never share this code with anyone.</p>
        </div>
        """
        smtp_sent, smtp_msg = send_email_notification(email, email_subject, email_body, email_html)

        return jsonify({
            "message": f"A 6-digit recovery code has been generated for {email}. Valid for 15 minutes.",
            "otp_code": otp,  # Returned for verified instant testing and display
            "reset_token": reset_token,
            "smtp_sent": smtp_sent,
            "smtp_note": "Real email dispatched via SMTP" if smtp_sent else "SMTP not configured; code returned for testing and logged to server console.",
            "email": email
        }), 200
    finally:
        conn.close()


@app.post("/api/auth/verify-otp")
def verify_otp():
    data = request.get_json(silent=True) or {}
    email = data.get("email", "").strip().lower()
    otp = data.get("otp_code", "").strip()

    if not email or not otp:
        return jsonify({"error": "Registered email address and 6-digit OTP code are required."}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, expires_at, is_used FROM password_resets
                WHERE email = %s AND otp_code = %s AND is_used = FALSE
                ORDER BY id DESC LIMIT 1
            """, (email, otp))
            record = cur.fetchone()

        if not record:
            return jsonify({"error": "Invalid or already used OTP code. Please check the code or request a new one."}), 400

        # Check expiration
        expires_at = record['expires_at']
        if isinstance(expires_at, datetime.datetime) and expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=datetime.timezone.utc)
        
        if datetime.datetime.now(datetime.timezone.utc) > expires_at:
            return jsonify({"error": "This OTP code has expired. Please request a fresh recovery code."}), 400

        return jsonify({"message": "OTP verified successfully. Please enter and confirm your new password.", "valid": True}), 200
    finally:
        conn.close()


@app.post("/api/auth/reset-password")
def reset_password():
    data = request.get_json(silent=True) or {}
    email = data.get("email", "").strip().lower()
    otp = data.get("otp_code", "").strip()
    new_password = data.get("new_password", "").strip()
    confirm_password = data.get("confirm_password", "").strip()

    if not email or not otp or not new_password:
        return jsonify({"error": "Email address, OTP code, and new password are required."}), 400

    if len(new_password) < 6:
        return jsonify({"error": "New password must be at least 6 characters long."}), 400

    if confirm_password and confirm_password != new_password:
        return jsonify({"error": "New passwords do not match. Please re-enter your confirmation password."}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, expires_at, is_used FROM password_resets
                WHERE email = %s AND otp_code = %s AND is_used = FALSE
                ORDER BY id DESC LIMIT 1
            """, (email, otp))
            record = cur.fetchone()

            if not record:
                return jsonify({"error": "Invalid or already used OTP code. Please request a new recovery code."}), 400

            expires_at = record['expires_at']
            if isinstance(expires_at, datetime.datetime) and expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=datetime.timezone.utc)

            if datetime.datetime.now(datetime.timezone.utc) > expires_at:
                return jsonify({"error": "This OTP code has expired. Please request a fresh code."}), 400

            # Update password securely
            hashed = hash_password(new_password)
            cur.execute("""
                UPDATE users SET password_hash = %s, reset_token = NULL, reset_token_expires = NULL 
                WHERE email = %s
            """, (hashed, email))

            # Mark OTP as used to prevent replay attacks
            cur.execute("UPDATE password_resets SET is_used = TRUE WHERE id = %s", (record['id'],))

        return jsonify({"message": "Your password has been reset successfully! You can now sign in with your new credentials."}), 200
    finally:
        conn.close()


# ==========================================
# 5. DASHBOARD STATS APIS
# ==========================================

@app.get("/api/dashboard/stats")
@token_required
def get_dashboard_stats(current_user):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            role = current_user['role']
            uid = current_user['id']

            if role == 'dealer':
                cur.execute("""
                    SELECT 
                        COUNT(*) AS total_shipments,
                        SUM(CASE WHEN status IN ('Pending', 'Assigned') THEN 1 ELSE 0 END) AS pending_requests,
                        SUM(CASE WHEN status = 'Accepted' THEN 1 ELSE 0 END) AS accepted_shipments,
                        SUM(CASE WHEN status = 'In Transit' THEN 1 ELSE 0 END) AS in_transit,
                        SUM(CASE WHEN status = 'Delivered' THEN 1 ELSE 0 END) AS delivered,
                        COALESCE(SUM(price_per_trip), 0) AS total_spend
                    FROM shipments WHERE dealer_id = %s
                """, (uid,))
                stats = cur.fetchone()
                return jsonify({"role": "dealer", "stats": stats}), 200

            elif role == 'transporter':
                cur.execute("""
                    SELECT 
                        COUNT(*) AS assigned_requests,
                        SUM(CASE WHEN status = 'Accepted' THEN 1 ELSE 0 END) AS accepted_trips,
                        SUM(CASE WHEN status = 'In Transit' THEN 1 ELSE 0 END) AS in_transit_trips,
                        SUM(CASE WHEN status = 'Delivered' THEN 1 ELSE 0 END) AS completed_trips,
                        COALESCE(SUM(CASE WHEN status = 'Delivered' THEN price_per_trip ELSE 0 END), 0) AS total_earnings
                    FROM shipments WHERE transporter_id = %s
                """, (uid,))
                ship_stats = cur.fetchone()

                cur.execute("SELECT COUNT(*) AS fleet_count FROM vehicles WHERE transporter_id = %s", (uid,))
                fleet_count = cur.fetchone()['fleet_count']

                cur.execute("SELECT COUNT(*) AS driver_count FROM drivers WHERE transporter_id = %s", (uid,))
                driver_count = cur.fetchone()['driver_count']

                cur.execute("SELECT COUNT(*) AS available_orders FROM shipments WHERE status = 'Pending' AND transporter_id IS NULL")
                available_orders = cur.fetchone()['available_orders']

                ship_stats['fleet_count'] = fleet_count
                ship_stats['driver_count'] = driver_count
                ship_stats['available_orders'] = available_orders
                return jsonify({"role": "transporter", "stats": ship_stats}), 200

            elif role == 'admin':
                cur.execute("SELECT COUNT(*) AS total_dealers FROM users WHERE role = 'dealer'")
                total_dealers = cur.fetchone()['total_dealers']

                cur.execute("SELECT COUNT(*) AS total_transporters FROM users WHERE role = 'transporter'")
                total_transporters = cur.fetchone()['total_transporters']

                cur.execute("""
                    SELECT 
                        COUNT(*) AS total_shipments,
                        SUM(CASE WHEN status IN ('Pending', 'Assigned') THEN 1 ELSE 0 END) AS pending_shipments,
                        SUM(CASE WHEN status IN ('Accepted', 'In Transit') THEN 1 ELSE 0 END) AS active_shipments,
                        SUM(CASE WHEN status = 'Delivered' THEN 1 ELSE 0 END) AS completed_shipments
                    FROM shipments
                """)
                ship_counts = cur.fetchone()

                cur.execute("SELECT COUNT(*) AS pending_docs FROM documents WHERE verification_status = 'pending'")
                pending_docs = cur.fetchone()['pending_docs']

                cur.execute("SELECT COUNT(*) AS total_vehicles FROM vehicles")
                total_vehicles = cur.fetchone()['total_vehicles']

                return jsonify({
                    "role": "admin",
                    "stats": {
                        "total_dealers": total_dealers,
                        "total_transporters": total_transporters,
                        "total_shipments": ship_counts['total_shipments'],
                        "pending_shipments": ship_counts['pending_shipments'],
                        "active_shipments": ship_counts['active_shipments'],
                        "completed_shipments": ship_counts['completed_shipments'],
                        "pending_docs": pending_docs,
                        "total_vehicles": total_vehicles
                    }
                }), 200

            return jsonify({"error": "Unknown role"}), 400
    finally:
        conn.close()


# ==========================================
# 6. TRANSPORTERS DIRECTORY & FLEET
# ==========================================

@app.get("/api/transporters")
def list_transporters():
    """Returns verified active transporters with fleet statistics."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 
                    u.id, u.company_name, u.contact_person, u.mobile, u.email, u.gst_number,
                    u.city, u.state, u.verification_status,
                    COUNT(v.id) AS total_vehicles,
                    SUM(CASE WHEN v.status = 'available' THEN 1 ELSE 0 END) AS available_vehicles
                FROM users u
                LEFT JOIN vehicles v ON u.id = v.transporter_id
                WHERE u.role = 'transporter' AND u.status = 'active'
                GROUP BY u.id
                ORDER BY u.verification_status DESC, u.company_name ASC
            """)
            transporters = cur.fetchall()
        return jsonify({"transporters": transporters}), 200
    finally:
        conn.close()


@app.get("/api/transporters/<int:transporter_id>")
def get_transporter_details(transporter_id):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, company_name, contact_person, mobile, email, gst_number, address, city, state, verification_status
                FROM users WHERE id = %s AND role = 'transporter'
            """, (transporter_id,))
            transporter = cur.fetchone()
            if not transporter:
                return jsonify({"error": "Transporter not found"}), 404

            cur.execute("""
                SELECT id, vehicle_number, vehicle_type, capacity_tons, status, current_location,
                       COALESCE(image_url, '/assets/vehicles/container-truck.svg') AS image_url
                FROM vehicles WHERE transporter_id = %s
            """, (transporter_id,))
            vehicles = cur.fetchall()
            transporter['vehicles'] = vehicles

        return jsonify({"transporter": transporter}), 200
    finally:
        conn.close()


# ==========================================
# 7. SHIPMENT SYSTEM
# ==========================================

@app.post("/api/shipments")
@token_required
@role_required('dealer', 'admin')
def create_shipment(current_user):
    data = request.get_json(silent=True) or {}
    product_type = data.get("product_type", "").strip()
    transport_type = data.get("transport_type", "").strip() or "Full Truckload (FTL)"
    weight_tons = data.get("weight_tons")
    vehicle_required = data.get("vehicle_required", "").strip()
    pickup_location = data.get("pickup_location", "").strip()
    delivery_location = data.get("delivery_location", "").strip()
    pickup_date = data.get("pickup_date") or None
    expected_delivery_date = data.get("expected_delivery_date") or None
    price_per_trip = data.get("price_per_trip", 0.0)
    transporter_id = data.get("transporter_id") or None
    invoice_document = data.get("invoice_document", "").strip()
    do_document = data.get("do_document", "").strip()
    notes = data.get("notes", "").strip()

    if not product_type or not transport_type or not weight_tons or not vehicle_required or not pickup_location or not delivery_location:
        return jsonify({"error": "Product type, transport type, weight, vehicle required, pickup and delivery locations are required."}), 400

    try:
        weight_tons = float(weight_tons)
        price_per_trip = float(price_per_trip)
    except (ValueError, TypeError):
        return jsonify({"error": "Weight and price must be valid numeric values"}), 400

    dealer_id = current_user['id']
    status = 'Assigned' if transporter_id else 'Pending'

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # If transporter selected, check validity
            if transporter_id:
                cur.execute("SELECT company_name FROM users WHERE id = %s AND role = 'transporter'", (transporter_id,))
                t_user = cur.fetchone()
                if not t_user:
                    return jsonify({"error": "Selected transporter was not found"}), 404

            cur.execute("""
                INSERT INTO shipments (
                    dealer_id, transporter_id, product_type, transport_type, weight_tons, vehicle_required,
                    pickup_location, delivery_location, pickup_date, expected_delivery_date, price_per_trip,
                    invoice_document, do_document, status, notes
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                dealer_id, transporter_id, product_type, transport_type, weight_tons, vehicle_required,
                pickup_location, delivery_location, pickup_date, expected_delivery_date, price_per_trip,
                invoice_document, do_document, status, notes
            ))
            shipment_id = cur.lastrowid

            # Create notification for transporter if assigned
            if transporter_id:
                cur.execute("""
                    INSERT INTO notifications (user_id, title, message, link)
                    VALUES (%s, %s, %s, %s)
                """, (
                    transporter_id,
                    f"New Shipment Request #{shipment_id}",
                    f"A new cargo request for {product_type} ({weight_tons}T) from {pickup_location} to {delivery_location} has been assigned to you by {current_user['email']}.",
                    f"/shipments/{shipment_id}"
                ))

            # Create initial tracking placeholder
            cur.execute("""
                INSERT INTO tracking_records (shipment_id, latitude, longitude, location_name, speed_kmh, status_note)
                VALUES (%s, 19.0760, 72.8777, %s, 0.00, 'Shipment Registered at Origin')
            """, (shipment_id, pickup_location))

        return jsonify({
            "message": f"Shipment #{shipment_id} successfully created!",
            "shipment_id": shipment_id,
            "status": status
        }), 201
    except Exception as e:
        return jsonify({"error": f"Failed to create shipment: {str(e)}"}), 500
    finally:
        conn.close()


@app.get("/api/shipments")
@token_required
def list_shipments(current_user):
    role = current_user['role']
    uid = current_user['id']

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            if role == 'dealer':
                cur.execute("""
                    SELECT 
                        s.*,
                        u_d.company_name AS dealer_company, u_d.mobile AS dealer_mobile,
                        u_t.company_name AS transporter_company, u_t.mobile AS transporter_mobile,
                        v.vehicle_number, v.vehicle_type AS assigned_vehicle_type,
                        COALESCE(v.image_url, '/assets/vehicles/container-truck.svg') AS vehicle_image,
                        d.name AS driver_name, d.mobile AS driver_mobile
                    FROM shipments s
                    JOIN users u_d ON s.dealer_id = u_d.id
                    LEFT JOIN users u_t ON s.transporter_id = u_t.id
                    LEFT JOIN vehicles v ON s.vehicle_id = v.id
                    LEFT JOIN drivers d ON s.driver_id = d.id
                    WHERE s.dealer_id = %s
                    ORDER BY s.id DESC
                """, (uid,))
            elif role == 'transporter':
                # Transporter sees requests assigned to them OR open pending shipments
                cur.execute("""
                    SELECT 
                        s.*,
                        u_d.company_name AS dealer_company, u_d.mobile AS dealer_mobile, u_d.email AS dealer_email,
                        u_t.company_name AS transporter_company, u_t.mobile AS transporter_mobile,
                        v.vehicle_number, v.vehicle_type AS assigned_vehicle_type,
                        COALESCE(v.image_url, '/assets/vehicles/container-truck.svg') AS vehicle_image,
                        d.name AS driver_name, d.mobile AS driver_mobile
                    FROM shipments s
                    JOIN users u_d ON s.dealer_id = u_d.id
                    LEFT JOIN users u_t ON s.transporter_id = u_t.id
                    LEFT JOIN vehicles v ON s.vehicle_id = v.id
                    LEFT JOIN drivers d ON s.driver_id = d.id
                    WHERE s.transporter_id = %s OR (s.transporter_id IS NULL AND s.status = 'Pending')
                    ORDER BY s.id DESC
                """, (uid,))
            else:  # Admin sees all
                cur.execute("""
                    SELECT 
                        s.*,
                        u_d.company_name AS dealer_company, u_d.mobile AS dealer_mobile,
                        u_t.company_name AS transporter_company, u_t.mobile AS transporter_mobile,
                        v.vehicle_number, v.vehicle_type AS assigned_vehicle_type,
                        COALESCE(v.image_url, '/assets/vehicles/container-truck.svg') AS vehicle_image,
                        d.name AS driver_name, d.mobile AS driver_mobile
                    FROM shipments s
                    JOIN users u_d ON s.dealer_id = u_d.id
                    LEFT JOIN users u_t ON s.transporter_id = u_t.id
                    LEFT JOIN vehicles v ON s.vehicle_id = v.id
                    LEFT JOIN drivers d ON s.driver_id = d.id
                    ORDER BY s.id DESC
                """)

            shipments = cur.fetchall()
        return jsonify({"shipments": shipments}), 200
    finally:
        conn.close()


@app.get("/api/shipments/<int:shipment_id>")
@token_required
def get_shipment_details(current_user, shipment_id):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 
                    s.*,
                    u_d.company_name AS dealer_company, u_d.mobile AS dealer_mobile, u_d.email AS dealer_email, u_d.gst_number AS dealer_gst,
                    u_t.company_name AS transporter_company, u_t.mobile AS transporter_mobile, u_t.email AS transporter_email,
                    v.vehicle_number, v.vehicle_type AS assigned_vehicle_type, v.capacity_tons AS vehicle_capacity,
                    d.name AS driver_name, d.mobile AS driver_mobile, d.license_number AS driver_license
                FROM shipments s
                JOIN users u_d ON s.dealer_id = u_d.id
                LEFT JOIN users u_t ON s.transporter_id = u_t.id
                LEFT JOIN vehicles v ON s.vehicle_id = v.id
                LEFT JOIN drivers d ON s.driver_id = d.id
                WHERE s.id = %s
            """, (shipment_id,))
            shipment = cur.fetchone()

            if not shipment:
                return jsonify({"error": "Shipment not found"}), 404

            # Authorization check
            role = current_user['role']
            uid = current_user['id']
            if role == 'dealer' and shipment['dealer_id'] != uid:
                return jsonify({"error": "Access forbidden"}), 403
            if role == 'transporter' and shipment['transporter_id'] and shipment['transporter_id'] != uid:
                return jsonify({"error": "Access forbidden"}), 403

            # Fetch associated documents
            cur.execute("""
                SELECT id, document_type, file_name, file_path, verification_status, uploaded_at
                FROM documents WHERE shipment_id = %s
            """, (shipment_id,))
            docs = cur.fetchall()
            shipment['documents'] = docs

            # Fetch latest tracking coordinates
            cur.execute("""
                SELECT id, latitude, longitude, location_name, speed_kmh, status_note, recorded_at
                FROM tracking_records WHERE shipment_id = %s
                ORDER BY recorded_at DESC LIMIT 10
            """, (shipment_id,))
            tracks = cur.fetchall()
            shipment['tracking_history'] = tracks

        return jsonify({"shipment": shipment}), 200
    finally:
        conn.close()


@app.put("/api/shipments/<int:shipment_id>/status")
@token_required
def update_shipment_status(current_user, shipment_id):
    data = request.get_json(silent=True) or {}
    new_status = data.get("status", "").strip()
    vehicle_id = data.get("vehicle_id")
    driver_id = data.get("driver_id")
    note = data.get("note", "").strip()
    location_name = (data.get("location_name") or "").strip()

    valid_statuses = [
        'Pending', 'Assigned', 'Accepted', 'Pickup', 'In Transit', 
        'Out for Delivery', 'Delivered', 'Exception', 'Cancelled'
    ]
    if new_status not in valid_statuses:
        return jsonify({"error": f"Invalid status '{new_status}'. Allowed statuses: {', '.join(valid_statuses)}"}), 400

    role = current_user['role']
    uid = current_user['id']

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM shipments WHERE id = %s", (shipment_id,))
            shipment = cur.fetchone()
            if not shipment:
                return jsonify({"error": f"Shipment #{shipment_id} not found."}), 404

            # Permissions Check
            if role == 'transporter':
                if shipment['transporter_id'] and shipment['transporter_id'] != uid:
                    return jsonify({"error": "You are not the authorized transporter assigned to this consignment."}), 403
                # Transporter claiming open shipment
                if not shipment['transporter_id'] and new_status == 'Accepted':
                    cur.execute("UPDATE shipments SET transporter_id = %s WHERE id = %s", (uid, shipment_id))

            elif role == 'dealer':
                if shipment['dealer_id'] != uid:
                    return jsonify({"error": "You do not own this consignment."}), 403
                if new_status not in ['Cancelled']:
                    return jsonify({"error": "Dealers may only cancel consignments before transit dispatch."}), 403

            # Update shipment
            cur.execute("""
                UPDATE shipments SET 
                    status = %s,
                    vehicle_id = COALESCE(%s, vehicle_id),
                    driver_id = COALESCE(%s, driver_id),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (new_status, vehicle_id, driver_id, shipment_id))

            # Update vehicle status
            v_id = vehicle_id or shipment.get('vehicle_id')
            if v_id:
                if new_status in ['Pickup', 'In Transit', 'Out for Delivery']:
                    cur.execute("UPDATE vehicles SET status = 'in_transit' WHERE id = %s", (v_id,))
                elif new_status == 'Delivered':
                    cur.execute("UPDATE vehicles SET status = 'available' WHERE id = %s", (v_id,))

            # Add milestone tracking record
            status_text = note or f"Consignment status updated to {new_status}"
            checkpoint = location_name or (shipment['delivery_location'] if new_status == 'Delivered' else shipment['pickup_location'])
            cur.execute("""
                INSERT INTO tracking_records (shipment_id, vehicle_id, latitude, longitude, location_name, speed_kmh, status_note, checkpoint_type)
                VALUES (%s, %s, 19.0760, 72.8777, %s, %s, %s, %s)
            """, (shipment_id, v_id, checkpoint, 45.0 if new_status == 'In Transit' else 0.0, status_text, new_status.lower().replace(' ', '_')))

            # Send automated in-app notification to Dealer
            cur.execute("""
                INSERT INTO notifications (user_id, title, message, link)
                VALUES (%s, %s, %s, %s)
            """, (
                shipment['dealer_id'],
                f"Shipment #{shipment_id} Milestone: {new_status}",
                f"Your consignment of {shipment['product_type']} is now '{new_status}'. {status_text}",
                f"/shipments/{shipment_id}"
            ))

        # Real-time WebSocket broadcast for live dashboards
        try:
            socketio.emit('shipment_status_changed', {
                'shipment_id': shipment_id,
                'status': new_status,
                'note': status_text,
                'location_name': checkpoint
            })
            socketio.emit('location_updated', {
                'shipment_id': shipment_id,
                'latitude': 19.0760,
                'longitude': 72.8777,
                'location_name': checkpoint,
                'speed_kmh': 45.0 if new_status == 'In Transit' else 0.0,
                'status_note': status_text
            })
        except Exception as socket_err:
            print(f"[Socket Broadcast] {socket_err}")

        return jsonify({
            "message": f"Shipment #{shipment_id} successfully updated to '{new_status}'!",
            "status": new_status,
            "note": status_text,
            "checkpoint": checkpoint
        }), 200
    finally:
        conn.close()


@app.put("/api/shipments/<int:shipment_id>/assign")
@token_required
@role_required('dealer', 'admin')
def assign_transporter_to_shipment(current_user, shipment_id):
    data = request.get_json(silent=True) or {}
    transporter_id = data.get("transporter_id")
    if not transporter_id:
        return jsonify({"error": "Transporter ID is required"}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, dealer_id FROM shipments WHERE id = %s", (shipment_id,))
            shipment = cur.fetchone()
            if not shipment:
                return jsonify({"error": "Shipment not found"}), 404

            if current_user['role'] == 'dealer' and shipment['dealer_id'] != current_user['id']:
                return jsonify({"error": "You do not own this shipment"}), 403

            cur.execute("SELECT id, company_name FROM users WHERE id = %s AND role = 'transporter'", (transporter_id,))
            transporter = cur.fetchone()
            if not transporter:
                return jsonify({"error": "Transporter not found"}), 404

            cur.execute("""
                UPDATE shipments SET transporter_id = %s, status = 'Assigned' WHERE id = %s
            """, (transporter_id, shipment_id))

            cur.execute("""
                INSERT INTO notifications (user_id, title, message, link)
                VALUES (%s, %s, %s, %s)
            """, (
                transporter_id,
                f"Shipment #{shipment_id} Assigned to You",
                f"You have been chosen by the dealer for shipment #{shipment_id}.",
                f"/shipments/{shipment_id}"
            ))

        return jsonify({"message": f"Shipment #{shipment_id} assigned to {transporter['company_name']}"}), 200
    finally:
        conn.close()


# ==========================================
# 8. VEHICLES & DRIVERS (TRANSPORTER FLEET)
# ==========================================

@app.get("/api/vehicles")
@token_required
def list_vehicles(current_user):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            if current_user['role'] == 'transporter':
                cur.execute("""
                    SELECT v.*, u.company_name AS transporter_name
                    FROM vehicles v
                    JOIN users u ON v.transporter_id = u.id
                    WHERE v.transporter_id = %s
                    ORDER BY v.id DESC
                """, (current_user['id'],))
            else:
                cur.execute("""
                    SELECT v.*, u.company_name AS transporter_name
                    FROM vehicles v
                    JOIN users u ON v.transporter_id = u.id
                    ORDER BY v.id DESC
                """)
            vehicles = cur.fetchall()
            for v in vehicles:
                if not v.get('image_url'):
                    v['image_url'] = get_default_vehicle_image(v.get('vehicle_type'))
        return jsonify({"vehicles": vehicles}), 200
    finally:
        conn.close()


@app.post("/api/vehicles")
@token_required
@role_required('transporter', 'admin')
def add_vehicle(current_user):
    data = request.get_json(silent=True) or {}
    vehicle_number = data.get("vehicle_number", "").strip().upper()
    vehicle_type = data.get("vehicle_type", "").strip()
    capacity_tons = data.get("capacity_tons")
    rc_document = data.get("rc_document", "").strip()
    insurance_document = data.get("insurance_document", "").strip()
    current_location = data.get("current_location", "Main Logistics Hub").strip()

    if not vehicle_number or not vehicle_type or not capacity_tons:
        return jsonify({"error": "Vehicle number, type, and capacity in tons are required"}), 400

    try:
        capacity_tons = float(capacity_tons)
    except (ValueError, TypeError):
        return jsonify({"error": "Capacity must be a valid number"}), 400

    image_url = (data.get("image_url") or "").strip() or get_default_vehicle_image(vehicle_type)

    transporter_id = current_user['id']

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM vehicles WHERE vehicle_number = %s", (vehicle_number,))
            if cur.fetchone():
                return jsonify({"error": "A vehicle with this registration number already exists"}), 409

            cur.execute("""
                INSERT INTO vehicles (transporter_id, vehicle_number, vehicle_type, capacity_tons, rc_document, insurance_document, current_location, status, image_url)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'available', %s)
            """, (transporter_id, vehicle_number, vehicle_type, capacity_tons, rc_document, insurance_document, current_location, image_url))
            vehicle_id = cur.lastrowid

        return jsonify({
            "message": f"Vehicle {vehicle_number} registered successfully",
            "vehicle_id": vehicle_id
        }), 201
    except Exception as e:
        return jsonify({"error": f"Failed to register vehicle: {str(e)}"}), 500
    finally:
        conn.close()


@app.get("/api/drivers")
@token_required
def list_drivers(current_user):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            if current_user['role'] == 'transporter':
                cur.execute("""
                    SELECT d.*, v.vehicle_number, v.vehicle_type
                    FROM drivers d
                    LEFT JOIN vehicles v ON d.vehicle_id = v.id
                    WHERE d.transporter_id = %s
                    ORDER BY d.id DESC
                """, (current_user['id'],))
            else:
                cur.execute("""
                    SELECT d.*, v.vehicle_number, v.vehicle_type, u.company_name AS transporter_name
                    FROM drivers d
                    JOIN users u ON d.transporter_id = u.id
                    LEFT JOIN vehicles v ON d.vehicle_id = v.id
                    ORDER BY d.id DESC
                """)
            drivers = cur.fetchall()
        return jsonify({"drivers": drivers}), 200
    finally:
        conn.close()


@app.post("/api/drivers")
@token_required
@role_required('transporter', 'admin')
def add_driver(current_user):
    data = request.get_json(silent=True) or {}
    name = data.get("name", "").strip()
    mobile = data.get("mobile", "").strip()
    license_number = data.get("license_number", "").strip().upper()
    aadhaar_number = data.get("aadhaar_number", "").strip()
    vehicle_id = data.get("vehicle_id") or None
    license_document = data.get("license_document", "").strip()
    aadhaar_document = data.get("aadhaar_document", "").strip()

    if not name or not mobile or not license_number:
        return jsonify({"error": "Driver name, mobile number, and license number are required"}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO drivers (transporter_id, vehicle_id, name, mobile, license_number, aadhaar_number, license_document, aadhaar_document, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'available')
            """, (current_user['id'], vehicle_id, name, mobile, license_number, aadhaar_number, license_document, aadhaar_document))
            driver_id = cur.lastrowid

        return jsonify({
            "message": f"Driver {name} registered successfully",
            "driver_id": driver_id
        }), 201
    except Exception as e:
        return jsonify({"error": f"Failed to register driver: {str(e)}"}), 500
    finally:
        conn.close()


# ==========================================
# 9. DOCUMENT UPLOAD & SECURE STORAGE
# ==========================================

@app.post("/api/documents/upload")
@token_required
def upload_document(current_user):
    """
    Accepts multipart/form-data upload.
    Validates file extension, size, and saves securely with UUID.
    Saves document record in database.
    """
    if 'file' not in request.files:
        return jsonify({"error": "No file part provided in request"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": f"File type not allowed. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"}), 400

    doc_type = request.form.get('document_type', 'other').strip().lower()
    valid_types = ['aadhaar', 'driving_license', 'invoice', 'delivery_order', 'rc', 'insurance', 'other']
    if doc_type not in valid_types:
        doc_type = 'other'

    shipment_id = request.form.get('shipment_id') or None
    vehicle_id = request.form.get('vehicle_id') or None

    orig_filename = secure_filename(file.filename)
    extension = orig_filename.rsplit('.', 1)[1].lower() if '.' in orig_filename else 'bin'
    stored_name = f"{doc_type}_{uuid.uuid4().hex[:12]}.{extension}"
    save_path = os.path.join(UPLOAD_DIR, 'documents', stored_name)

    file.save(save_path)
    file_size = os.path.getsize(save_path)
    mime_type = file.content_type or 'application/octet-stream'

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO documents (user_id, shipment_id, vehicle_id, document_type, file_name, file_path, file_size, mime_type, verification_status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'pending')
            """, (current_user['id'], shipment_id, vehicle_id, doc_type, orig_filename, stored_name, file_size, mime_type))
            doc_id = cur.lastrowid

        return jsonify({
            "message": f"Document '{orig_filename}' uploaded successfully",
            "document_id": doc_id,
            "document_type": doc_type,
            "file_name": orig_filename,
            "download_url": f"/api/documents/{doc_id}/download"
        }), 201
    except Exception as e:
        return jsonify({"error": f"Database recording failed: {str(e)}"}), 500
    finally:
        conn.close()


@app.get("/api/documents")
@token_required
def list_documents(current_user):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            if current_user['role'] == 'admin':
                cur.execute("""
                    SELECT d.*, u.company_name, u.role AS user_role, u.email
                    FROM documents d
                    JOIN users u ON d.user_id = u.id
                    ORDER BY d.uploaded_at DESC
                """)
            else:
                cur.execute("""
                    SELECT * FROM documents
                    WHERE user_id = %s
                    ORDER BY uploaded_at DESC
                """, (current_user['id'],))
            docs = cur.fetchall()
        return jsonify({"documents": docs}), 200
    finally:
        conn.close()


@app.get("/api/documents/<int:doc_id>/download")
@token_required
def download_document(current_user, doc_id):
    """
    Secure file retrieval. Checks that caller has permission to view this document.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM documents WHERE id = %s", (doc_id,))
            doc = cur.fetchone()

        if not doc:
            return jsonify({"error": "Document not found"}), 404

        # Access check: admin or document owner or involved in shipment
        if current_user['role'] != 'admin' and doc['user_id'] != current_user['id']:
            if doc['shipment_id']:
                with conn.cursor() as cur:
                    cur.execute("SELECT dealer_id, transporter_id FROM shipments WHERE id = %s", (doc['shipment_id'],))
                    s = cur.fetchone()
                    if not s or (current_user['id'] not in [s['dealer_id'], s['transporter_id']]):
                        return jsonify({"error": "Access forbidden"}), 403
            else:
                return jsonify({"error": "Access forbidden"}), 403

        doc_dir = os.path.join(UPLOAD_DIR, 'documents')
        return send_from_directory(
            doc_dir,
            doc['file_path'],
            download_name=doc['file_name'],
            as_attachment=False
        )
    finally:
        conn.close()


@app.put("/api/documents/<int:doc_id>/verify")
@token_required
@role_required('admin')
def verify_document(current_user, doc_id):
    data = request.get_json(silent=True) or {}
    status = data.get("status", "").strip().lower()
    reason = data.get("reason", "").strip()

    if status not in ['verified', 'rejected']:
        return jsonify({"error": "Status must be 'verified' or 'rejected'"}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM documents WHERE id = %s", (doc_id,))
            doc = cur.fetchone()
            if not doc:
                return jsonify({"error": "Document not found"}), 404

            cur.execute("""
                UPDATE documents SET verification_status = %s, rejection_reason = %s WHERE id = %s
            """, (status, reason if status == 'rejected' else None, doc_id))

            cur.execute("""
                INSERT INTO notifications (user_id, title, message)
                VALUES (%s, %s, %s)
            """, (
                doc['user_id'],
                f"Document {doc['document_type'].replace('_', ' ').title()} {status.capitalize()}",
                f"Your uploaded {doc['document_type']} ({doc['file_name']}) was {status}." + (f" Reason: {reason}" if reason else "")
            ))

        return jsonify({"message": f"Document marked as {status}"}), 200
    finally:
        conn.close()


# ==========================================
# 10. LIVE TRACKING
# ==========================================

@app.get("/api/tracking/<int:shipment_id>")
def get_live_tracking(shipment_id):
    # Check optional token
    auth_header = request.headers.get('Authorization', '')
    current_user = None
    if auth_header.startswith('Bearer '):
        token = auth_header.split(' ', 1)[1].strip()
        current_user = decode_access_token(token)

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT s.id, s.product_type, s.pickup_location, s.delivery_location, s.status, s.weight_tons,
                       s.created_at, s.updated_at,
                       v.vehicle_number, v.vehicle_type, COALESCE(v.image_url, '/assets/vehicles/container-truck.svg') AS vehicle_image,
                       d.name AS driver_name, d.mobile AS driver_mobile,
                       u_trans.company_name AS transporter_name,
                       u_dealer.company_name AS dealer_name
                FROM shipments s
                LEFT JOIN vehicles v ON s.vehicle_id = v.id
                LEFT JOIN drivers d ON s.driver_id = d.id
                LEFT JOIN users u_trans ON s.transporter_id = u_trans.id
                LEFT JOIN users u_dealer ON s.dealer_id = u_dealer.id
                WHERE s.id = %s
            """, (shipment_id,))
            shipment = cur.fetchone()

            if not shipment:
                return jsonify({"error": f"Consignment #{shipment_id} not found in database. Please check your Shipment ID."}), 404

            # If public guest (not logged in), mask sensitive personal phone numbers for privacy
            if not current_user:
                if shipment.get('driver_mobile'):
                    mob = shipment['driver_mobile']
                    shipment['driver_mobile'] = mob[:2] + '******' + mob[-2:] if len(mob) >= 6 else '******'

            cur.execute("""
                SELECT id, latitude, longitude, location_name, speed_kmh, status_note, heading, accuracy, checkpoint_type, recorded_at
                FROM tracking_records
                WHERE shipment_id = %s
                ORDER BY recorded_at DESC
            """, (shipment_id,))
            records = cur.fetchall()

            # Format datetime
            if shipment.get('created_at'): shipment['created_at'] = shipment['created_at'].isoformat()
            if shipment.get('updated_at'): shipment['updated_at'] = shipment['updated_at'].isoformat()
            for r in records:
                if r.get('recorded_at'): r['recorded_at'] = r['recorded_at'].isoformat()

        latest = records[0] if records else {
            "latitude": 19.0760,
            "longitude": 72.8777,
            "location_name": shipment['pickup_location'],
            "speed_kmh": 0.00,
            "heading": 0.0,
            "accuracy": 10.0,
            "status_note": f"Consignment Registered: {shipment['status']}",
            "checkpoint_type": "registered",
            "recorded_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }

        return jsonify({
            "shipment": shipment,
            "latest_location": latest,
            "history": records
        }), 200
    finally:
        conn.close()


@app.post("/api/tracking/update")
@app.post("/api/tracking/live")
@token_required
@role_required('transporter', 'admin')
def update_live_tracking(current_user):
    data = request.get_json(silent=True) or {}
    shipment_id = data.get("shipment_id")
    latitude = data.get("latitude")
    longitude = data.get("longitude")
    location_name = (data.get("location_name") or "").strip()
    speed_kmh = float(data.get("speed_kmh") or 0.0)
    heading = float(data.get("heading") or 0.0)
    accuracy = float(data.get("accuracy") or 10.0)
    status_note = (data.get("status_note") or "In Transit").strip()

    if not shipment_id or latitude is None or longitude is None:
        return jsonify({"error": "Shipment ID, latitude, and longitude are required"}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT s.id, s.vehicle_id, s.dealer_id, s.transporter_id,
                       v.vehicle_number, v.vehicle_type, COALESCE(v.image_url, '/assets/vehicles/container-truck.svg') AS vehicle_image,
                       u.company_name AS transporter_name
                FROM shipments s
                LEFT JOIN vehicles v ON s.vehicle_id = v.id
                LEFT JOIN users u ON s.transporter_id = u.id
                WHERE s.id = %s
            """, (shipment_id,))
            shipment = cur.fetchone()
            if not shipment:
                return jsonify({"error": "Shipment not found"}), 404

            if not location_name:
                location_name = f"Corridor GPS ({latitude:.4f}, {longitude:.4f})"

            cur.execute("""
                INSERT INTO tracking_records (shipment_id, vehicle_id, transporter_id, latitude, longitude, location_name, speed_kmh, heading, accuracy, status_note)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (shipment_id, shipment['vehicle_id'], current_user['id'], latitude, longitude, location_name, speed_kmh, heading, accuracy, status_note))
            record_id = cur.lastrowid

            if shipment['vehicle_id']:
                cur.execute("UPDATE vehicles SET current_location = %s WHERE id = %s", (location_name, shipment['vehicle_id']))

        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        payload = {
            "record_id": record_id,
            "shipment_id": shipment_id,
            "vehicle_id": shipment['vehicle_id'],
            "latitude": float(latitude),
            "longitude": float(longitude),
            "location_name": location_name,
            "speed_kmh": speed_kmh,
            "heading": heading,
            "accuracy": accuracy,
            "status_note": status_note,
            "recorded_at": now_iso,
            "vehicle_number": shipment['vehicle_number'],
            "vehicle_type": shipment['vehicle_type'],
            "vehicle_image": shipment['vehicle_image'],
            "transporter_name": shipment['transporter_name']
        }

        # Real-time WebSocket broadcasts
        try:
            socketio.emit("location_updated", payload, room=f"tracking_{shipment_id}")
            socketio.emit("location_updated", payload, room="fleet_live")
        except Exception:
            pass

        return jsonify({
            "message": "Live location updated and broadcasted successfully",
            "tracking": payload
        }), 200
    finally:
        conn.close()


@app.get("/api/fleet/live")
@token_required
def get_live_fleet(current_user):
    """
    Returns active fleet consignments with vehicle info, image, and latest GPS coordinates.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 
                    s.id AS shipment_id, s.product_type, s.pickup_location, s.delivery_location, s.status,
                    s.dealer_id, u_dealer.company_name AS dealer_name,
                    s.transporter_id, u_trans.company_name AS transporter_name,
                    v.id AS vehicle_id, v.vehicle_number, v.vehicle_type,
                    COALESCE(v.image_url, '/assets/vehicles/container-truck.svg') AS vehicle_image,
                    v.current_location AS vehicle_last_known_location,
                    d.id AS driver_id, d.name AS driver_name, d.mobile AS driver_mobile
                FROM shipments s
                JOIN users u_dealer ON s.dealer_id = u_dealer.id
                LEFT JOIN users u_trans ON s.transporter_id = u_trans.id
                LEFT JOIN vehicles v ON s.vehicle_id = v.id
                LEFT JOIN drivers d ON s.driver_id = d.id
                WHERE s.status IN ('In Transit', 'Accepted', 'Assigned', 'Pending')
                ORDER BY s.id DESC
            """)
            fleet_items = cur.fetchall()

            for item in fleet_items:
                cur.execute("""
                    SELECT latitude, longitude, location_name, speed_kmh, status_note, heading, accuracy, recorded_at
                    FROM tracking_records
                    WHERE shipment_id = %s
                    ORDER BY recorded_at DESC LIMIT 1
                """, (item['shipment_id'],))
                track = cur.fetchone()
                if track:
                    item['tracking'] = track
                    item['latest_tracking'] = track
                else:
                    default_track = {
                        'latitude': 19.0760,
                        'longitude': 72.8777,
                        'location_name': item['pickup_location'],
                        'speed_kmh': 0.0,
                        'heading': 0.0,
                        'accuracy': 15.0,
                        'status_note': 'Awaiting Transit Start',
                        'recorded_at': None
                    }
                    item['tracking'] = default_track
                    item['latest_tracking'] = default_track

        return jsonify({
            "fleet": fleet_items,
            "count": len(fleet_items),
            "active_count": len(fleet_items)
        }), 200
    finally:
        conn.close()


# ==========================================
# 11. LIVE CHAT SYSTEM
# ==========================================

@app.get("/api/chat/conversations")
@token_required
def get_chat_conversations(current_user):
    """
    Returns all active chat conversation threads for the logged-in Dealer or Transporter.
    Includes counterparty info, online status, vehicle image, last message, and unread counts.
    """
    uid = current_user['id']
    role = current_user['role']

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            if role == 'dealer':
                cur.execute("""
                    SELECT 
                        s.id AS shipment_id, s.product_type, s.pickup_location, s.delivery_location,
                        s.status, s.weight_tons, s.created_at,
                        u.id AS counterparty_id, u.company_name AS counterparty_name, u.role AS counterparty_role,
                        v.vehicle_number, v.vehicle_type,
                        COALESCE(v.image_url, '/assets/vehicles/container-truck.svg') AS vehicle_image
                    FROM shipments s
                    JOIN users u ON s.transporter_id = u.id
                    LEFT JOIN vehicles v ON s.vehicle_id = v.id
                    WHERE s.dealer_id = %s
                    ORDER BY s.id DESC
                """, (uid,))
            elif role == 'transporter':
                cur.execute("""
                    SELECT 
                        s.id AS shipment_id, s.product_type, s.pickup_location, s.delivery_location,
                        s.status, s.weight_tons, s.created_at,
                        u.id AS counterparty_id, u.company_name AS counterparty_name, u.role AS counterparty_role,
                        v.vehicle_number, v.vehicle_type,
                        COALESCE(v.image_url, '/assets/vehicles/container-truck.svg') AS vehicle_image
                    FROM shipments s
                    JOIN users u ON s.dealer_id = u.id
                    LEFT JOIN vehicles v ON s.vehicle_id = v.id
                    WHERE s.transporter_id = %s
                    ORDER BY s.id DESC
                """, (uid,))
            else:
                cur.execute("""
                    SELECT 
                        s.id AS shipment_id, s.product_type, s.pickup_location, s.delivery_location,
                        s.status, s.weight_tons, s.created_at,
                        u.id AS counterparty_id, u.company_name AS counterparty_name, u.role AS counterparty_role,
                        v.vehicle_number, v.vehicle_type,
                        COALESCE(v.image_url, '/assets/vehicles/container-truck.svg') AS vehicle_image
                    FROM shipments s
                    JOIN users u ON s.transporter_id = u.id
                    LEFT JOIN vehicles v ON s.vehicle_id = v.id
                    WHERE s.transporter_id IS NOT NULL
                    ORDER BY s.id DESC
                """)

            conversations = cur.fetchall()

            for conv in conversations:
                sid = conv['shipment_id']
                cur.execute("""
                    SELECT message, created_at, sender_id
                    FROM messages
                    WHERE shipment_id = %s
                    ORDER BY id DESC LIMIT 1
                """, (sid,))
                last_msg = cur.fetchone()
                if last_msg:
                    conv['last_message'] = last_msg['message']
                    conv['last_message_at'] = last_msg['created_at'].isoformat() if hasattr(last_msg['created_at'], 'isoformat') else str(last_msg['created_at'])
                else:
                    conv['last_message'] = "Start a direct conversation..."
                    conv['last_message_at'] = conv['created_at'].isoformat() if hasattr(conv['created_at'], 'isoformat') else str(conv['created_at'])

                cur.execute("""
                    SELECT COUNT(*) AS unread
                    FROM messages
                    WHERE shipment_id = %s AND receiver_id = %s AND is_read = FALSE
                """, (sid, uid))
                conv['unread_count'] = cur.fetchone()['unread']

                c_id = conv['counterparty_id']
                conv['counterparty_online'] = bool(connected_user_sids.get(c_id))

        return jsonify({"conversations": conversations}), 200
    finally:
        conn.close()


@app.get("/api/chat/<int:shipment_id>")
@token_required
def get_shipment_chat(current_user, shipment_id):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT dealer_id, transporter_id FROM shipments WHERE id = %s", (shipment_id,))
            shipment = cur.fetchone()
            if not shipment:
                return jsonify({"error": "Shipment not found"}), 404

            # Mark messages received by current user as read
            cur.execute("""
                UPDATE messages SET is_read = TRUE, read_at = NOW()
                WHERE shipment_id = %s AND receiver_id = %s AND is_read = FALSE
            """, (shipment_id, current_user['id']))

            cur.execute("""
                SELECT 
                    m.id, m.shipment_id, m.sender_id, m.receiver_id, m.message, m.message_type,
                    m.is_read, m.read_at, m.created_at,
                    u_send.company_name AS sender_name, u_send.role AS sender_role
                FROM messages m
                JOIN users u_send ON m.sender_id = u_send.id
                WHERE m.shipment_id = %s
                ORDER BY m.created_at ASC
            """, (shipment_id,))
            messages = cur.fetchall()

        try:
            socketio.emit('messages_marked_read', {
                'shipment_id': shipment_id,
                'reader_id': current_user['id']
            }, room=f"chat_{shipment_id}")
        except Exception:
            pass

        return jsonify({"messages": messages}), 200
    finally:
        conn.close()


@app.post("/api/chat/<int:shipment_id>")
@token_required
def send_chat_message(current_user, shipment_id):
    data = request.get_json(silent=True) or {}
    message_text = data.get("message", "").strip()
    message_type = (data.get("message_type") or "text").strip()

    if not message_text:
        return jsonify({"error": "Message content cannot be empty"}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT dealer_id, transporter_id FROM shipments WHERE id = %s", (shipment_id,))
            shipment = cur.fetchone()
            if not shipment:
                return jsonify({"error": "Shipment not found"}), 404

            uid = current_user['id']
            if uid == shipment['dealer_id']:
                receiver_id = shipment['transporter_id']
            elif uid == shipment['transporter_id']:
                receiver_id = shipment['dealer_id']
            else:
                receiver_id = shipment['transporter_id'] or shipment['dealer_id']

            if not receiver_id:
                return jsonify({"error": "No counterparty assigned to this shipment yet"}), 400

            cur.execute("""
                INSERT INTO messages (shipment_id, sender_id, receiver_id, message, message_type)
                VALUES (%s, %s, %s, %s, %s)
            """, (shipment_id, uid, receiver_id, message_text, message_type))
            msg_id = cur.lastrowid

            cur.execute("SELECT company_name FROM users WHERE id = %s", (uid,))
            sender_u = cur.fetchone()
            sender_name = (sender_u['company_name'] if sender_u else None) or current_user.get('email', 'User')

            cur.execute("""
                INSERT INTO notifications (user_id, title, message, link)
                VALUES (%s, %s, %s, %s)
            """, (
                receiver_id,
                f"New Message on Consignment #{shipment_id}",
                f"{sender_name}: {message_text[:80]}",
                f"/shipments/{shipment_id}"
            ))

        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        msg_payload = {
            "id": msg_id,
            "shipment_id": shipment_id,
            "sender_id": uid,
            "receiver_id": receiver_id,
            "message": message_text,
            "message_type": message_type,
            "is_read": False,
            "created_at": now_iso,
            "sender_name": sender_name,
            "sender_role": current_user['role']
        }

        # Broadcast via WebSocket
        try:
            socketio.emit('new_message', msg_payload, room=f"chat_{shipment_id}")
            socketio.emit('chat_notification', msg_payload, room=f"user_{receiver_id}")
        except Exception:
            pass

        return jsonify({
            "message": "Message sent",
            "message_id": msg_id,
            "data": msg_payload,
            "sent_at": now_iso
        }), 201
    finally:
        conn.close()


@app.post("/api/chat/<int:shipment_id>/read")
@token_required
def mark_shipment_chat_read(current_user, shipment_id):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE messages SET is_read = TRUE, read_at = NOW()
                WHERE shipment_id = %s AND receiver_id = %s AND is_read = FALSE
            """, (shipment_id, current_user['id']))
            affected = cur.rowcount

        try:
            socketio.emit('messages_marked_read', {
                'shipment_id': shipment_id,
                'reader_id': current_user['id']
            }, room=f"chat_{shipment_id}")
        except Exception:
            pass

        return jsonify({"message": "Messages marked as read", "marked_count": affected}), 200
    finally:
        conn.close()


@app.get("/api/chat/unread")
@token_required
def get_unread_count(current_user):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT COUNT(*) AS unread_count FROM messages
                WHERE receiver_id = %s AND is_read = FALSE
            """, (current_user['id'],))
            unread = cur.fetchone()['unread_count']
        return jsonify({"unread_count": unread}), 200
    finally:
        conn.close()


# ==========================================
# SOCKET.IO REAL-TIME EVENT HANDLERS
# ==========================================

connected_user_sids = {}  # user_id -> set(sids)
sid_to_user = {}          # sid -> user dict

def add_user_socket(user_id, sid, user_info):
    if user_id not in connected_user_sids:
        connected_user_sids[user_id] = set()
    connected_user_sids[user_id].add(sid)
    sid_to_user[sid] = user_info

def remove_user_socket(sid):
    if sid in sid_to_user:
        user_info = sid_to_user.pop(sid)
        user_id = user_info.get('id')
        if user_id and user_id in connected_user_sids:
            connected_user_sids[user_id].discard(sid)
            if not connected_user_sids[user_id]:
                del connected_user_sids[user_id]
                try:
                    socketio.emit('user_presence', {'user_id': user_id, 'status': 'offline'})
                except Exception:
                    pass
        return user_info
    return None

@socketio.on('connect')
def handle_socket_connect(auth=None):
    token = None
    if isinstance(auth, dict) and auth.get('token'):
        token = auth.get('token')
    elif request.args.get('token'):
        token = request.args.get('token')

    if token:
        try:
            payload = decode_access_token(token)
            uid = payload.get('user_id') or payload.get('sub')
            conn = get_db_connection()
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT id, role, company_name, email FROM users WHERE id = %s", (uid,))
                    u = cur.fetchone()
                    if u:
                        add_user_socket(u['id'], request.sid, u)
                        join_room(f"user_{u['id']}")
                        socketio.emit('user_presence', {'user_id': u['id'], 'status': 'online'})
                        emit('authenticated', {'user': u})
            finally:
                conn.close()
        except Exception:
            pass
    emit('connected', {'sid': request.sid})

@socketio.on('disconnect')
def handle_socket_disconnect():
    remove_user_socket(request.sid)

@socketio.on('authenticate')
def handle_socket_authenticate(data):
    token = data.get('token') if isinstance(data, dict) else None
    if not token:
        emit('auth_error', {'error': 'Token required'})
        return
    try:
        payload = decode_access_token(token)
        uid = payload.get('user_id') or payload.get('sub')
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT id, role, company_name, email FROM users WHERE id = %s", (uid,))
                u = cur.fetchone()
                if not u:
                    emit('auth_error', {'error': 'User not found'})
                    return
                add_user_socket(u['id'], request.sid, u)
                join_room(f"user_{u['id']}")
                socketio.emit('user_presence', {'user_id': u['id'], 'status': 'online'})
                emit('authenticated', {'user': u})
        finally:
            conn.close()
    except Exception as e:
        emit('auth_error', {'error': f'Authentication failed: {str(e)}'})

@socketio.on('join_chat')
def handle_socket_join_chat(data):
    shipment_id = data.get('shipment_id') if isinstance(data, dict) else data
    if shipment_id:
        join_room(f"chat_{shipment_id}")
        emit('joined_chat', {'shipment_id': shipment_id})

@socketio.on('leave_chat')
def handle_socket_leave_chat(data):
    shipment_id = data.get('shipment_id') if isinstance(data, dict) else data
    if shipment_id:
        leave_room(f"chat_{shipment_id}")

@socketio.on('send_message')
def handle_socket_send_message(data):
    user_info = sid_to_user.get(request.sid)
    if not user_info:
        token = data.get('token') if isinstance(data, dict) else None
        if token:
            try:
                payload = decode_access_token(token)
                uid = payload.get('user_id') or payload.get('sub')
                conn = get_db_connection()
                try:
                    with conn.cursor() as cur:
                        cur.execute("SELECT id, role, company_name, email FROM users WHERE id = %s", (uid,))
                        user_info = cur.fetchone()
                        if user_info:
                            add_user_socket(user_info['id'], request.sid, user_info)
                finally:
                    conn.close()
            except Exception:
                pass
    if not user_info:
        emit('error', {'message': 'Unauthorized to send message'})
        return

    shipment_id = data.get('shipment_id')
    message_text = (data.get('message') or "").strip()
    message_type = (data.get('message_type') or "text").strip()

    if not shipment_id or not message_text:
        emit('error', {'message': 'shipment_id and message are required'})
        return

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT dealer_id, transporter_id FROM shipments WHERE id = %s", (shipment_id,))
            shipment = cur.fetchone()
            if not shipment:
                emit('error', {'message': 'Shipment not found'})
                return

            uid = user_info['id']
            if uid == shipment['dealer_id']:
                receiver_id = shipment['transporter_id']
            elif uid == shipment['transporter_id']:
                receiver_id = shipment['dealer_id']
            else:
                receiver_id = shipment['transporter_id'] or shipment['dealer_id']

            if not receiver_id:
                emit('error', {'message': 'No counterparty assigned to shipment'})
                return

            cur.execute("""
                INSERT INTO messages (shipment_id, sender_id, receiver_id, message, message_type)
                VALUES (%s, %s, %s, %s, %s)
            """, (shipment_id, uid, receiver_id, message_text, message_type))
            msg_id = cur.lastrowid

            cur.execute("""
                INSERT INTO notifications (user_id, title, message, link)
                VALUES (%s, %s, %s, %s)
            """, (
                receiver_id,
                f"New Chat Message on Consignment #{shipment_id}",
                f"{user_info['company_name']}: {message_text[:80]}",
                f"/shipments/{shipment_id}"
            ))

        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        msg_payload = {
            "id": msg_id,
            "shipment_id": shipment_id,
            "sender_id": uid,
            "receiver_id": receiver_id,
            "message": message_text,
            "message_type": message_type,
            "is_read": False,
            "created_at": now_iso,
            "sender_name": user_info['company_name'],
            "sender_role": user_info['role']
        }

        socketio.emit('new_message', msg_payload, room=f"chat_{shipment_id}")
        socketio.emit('chat_notification', msg_payload, room=f"user_{receiver_id}")
        emit('message_sent', msg_payload)
    finally:
        conn.close()

@socketio.on('typing')
def handle_socket_typing(data):
    user_info = sid_to_user.get(request.sid)
    shipment_id = data.get('shipment_id') if isinstance(data, dict) else None
    is_typing = bool(data.get('is_typing', True)) if isinstance(data, dict) else True
    if user_info and shipment_id:
        emit('user_typing', {
            'shipment_id': shipment_id,
            'user_id': user_info['id'],
            'user_name': user_info['company_name'],
            'is_typing': is_typing
        }, room=f"chat_{shipment_id}", include_self=False)

@socketio.on('mark_read')
def handle_socket_mark_read(data):
    user_info = sid_to_user.get(request.sid)
    shipment_id = data.get('shipment_id') if isinstance(data, dict) else None
    if user_info and shipment_id:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE messages SET is_read = TRUE, read_at = NOW()
                    WHERE shipment_id = %s AND receiver_id = %s AND is_read = FALSE
                """, (shipment_id, user_info['id']))
            socketio.emit('messages_marked_read', {
                'shipment_id': shipment_id,
                'reader_id': user_info['id']
            }, room=f"chat_{shipment_id}")
        finally:
            conn.close()

@socketio.on('join_tracking')
def handle_socket_join_tracking(data):
    shipment_id = data.get('shipment_id') if isinstance(data, dict) else data
    if shipment_id:
        join_room(f"tracking_{shipment_id}")

@socketio.on('leave_tracking')
def handle_socket_leave_tracking(data):
    shipment_id = data.get('shipment_id') if isinstance(data, dict) else data
    if shipment_id:
        leave_room(f"tracking_{shipment_id}")

@socketio.on('join_fleet_tracking')
def handle_socket_join_fleet():
    join_room("fleet_live")

@socketio.on('leave_fleet_tracking')
def handle_socket_leave_fleet():
    leave_room("fleet_live")

@socketio.on('share_location')
def handle_socket_share_location(data):
    user_info = sid_to_user.get(request.sid)
    shipment_id = data.get('shipment_id')
    lat = data.get('latitude')
    lng = data.get('longitude')
    speed = float(data.get('speed_kmh') or 0.0)
    heading = float(data.get('heading') or 0.0)
    accuracy = float(data.get('accuracy') or 10.0)
    loc_name = (data.get('location_name') or "").strip()
    status_note = (data.get('status_note') or "In Transit").strip()

    if not shipment_id or lat is None or lng is None:
        emit('error', {'message': 'Invalid GPS location coordinates'})
        return

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT s.id, s.vehicle_id, v.vehicle_number, v.vehicle_type,
                       COALESCE(v.image_url, '/assets/vehicles/container-truck.svg') AS vehicle_image,
                       u.company_name AS transporter_name
                FROM shipments s
                LEFT JOIN vehicles v ON s.vehicle_id = v.id
                LEFT JOIN users u ON s.transporter_id = u.id
                WHERE s.id = %s
            """, (shipment_id,))
            ship = cur.fetchone()
            if not ship:
                emit('error', {'message': 'Shipment not found'})
                return

            if not loc_name:
                loc_name = f"Corridor Track ({lat:.4f}, {lng:.4f})"

            uid = user_info['id'] if user_info else None
            cur.execute("""
                INSERT INTO tracking_records (shipment_id, vehicle_id, transporter_id, latitude, longitude, location_name, speed_kmh, heading, accuracy, status_note)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (shipment_id, ship['vehicle_id'], uid, lat, lng, loc_name, speed, heading, accuracy, status_note))
            rec_id = cur.lastrowid

            if ship['vehicle_id']:
                cur.execute("UPDATE vehicles SET current_location = %s WHERE id = %s", (loc_name, ship['vehicle_id']))

        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        payload = {
            "record_id": rec_id,
            "shipment_id": shipment_id,
            "vehicle_id": ship['vehicle_id'],
            "latitude": float(lat),
            "longitude": float(lng),
            "speed_kmh": speed,
            "heading": heading,
            "accuracy": accuracy,
            "location_name": loc_name,
            "status_note": status_note,
            "recorded_at": now_iso,
            "vehicle_number": ship['vehicle_number'],
            "vehicle_type": ship['vehicle_type'],
            "vehicle_image": ship['vehicle_image'],
            "transporter_name": ship['transporter_name']
        }

        socketio.emit("location_updated", payload, room=f"tracking_{shipment_id}")
        socketio.emit("location_updated", payload, room="fleet_live")
        emit("location_acknowledged", payload)
    finally:
        conn.close()



# ==========================================
# 12. NOTIFICATIONS
# ==========================================

@app.get("/api/notifications")
@token_required
def list_notifications(current_user):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT * FROM notifications
                WHERE user_id = %s
                ORDER BY created_at DESC
                LIMIT 30
            """, (current_user['id'],))
            notifications = cur.fetchall()
        return jsonify({"notifications": notifications}), 200
    finally:
        conn.close()


@app.put("/api/notifications/read-all")
@token_required
def mark_all_notifications_read(current_user):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE notifications SET is_read = TRUE WHERE user_id = %s", (current_user['id'],))
        return jsonify({"message": "All notifications marked as read"}), 200
    finally:
        conn.close()


# ==========================================
# 13. AI ASSISTANT API
# ==========================================

@app.post("/api/chat")
@app.post("/api/ai/assistant")
def ai_assistant_endpoint():
    """
    Answers logistics questions, vehicle capacity, workflows, document questions.
    Works for both logged in users and landing page guests.
    """
    data = request.get_json(silent=True) or {}
    prompt = data.get("message", "").strip() or data.get("prompt", "").strip()

    if not prompt:
        return jsonify({"error": "Prompt or message is required"}), 400

    user_role = data.get("role", "dealer")
    company_name = data.get("company_name", "")

    # Check for optional auth token header
    auth_header = request.headers.get('Authorization')
    if auth_header:
        parts = auth_header.split()
        if len(parts) == 2:
            try:
                from backend.auth_util import decode_access_token
                payload = decode_access_token(parts[1])
                user_role = payload.get('role', user_role)
            except Exception:
                pass

    reply = get_logistics_ai_reply(prompt, user_role=user_role, user_company=company_name)
    return jsonify({
        "reply": reply,
        "input": prompt,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }), 200


# ==========================================
# 14. ADMIN MANAGEMENT APIS
# ==========================================

@app.get("/api/admin/users")
@token_required
@role_required('admin')
def admin_list_users(current_user):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, role, company_name, contact_person, mobile, email, gst_number, city, state, verification_status, status, created_at
                FROM users
                ORDER BY id DESC
            """)
            users = cur.fetchall()
        return jsonify({"users": users}), 200
    finally:
        conn.close()


@app.put("/api/admin/users/<int:user_id>/status")
@token_required
@role_required('admin')
def admin_toggle_user_status(current_user, user_id):
    data = request.get_json(silent=True) or {}
    status = data.get("status", "").strip().lower()

    if status not in ['active', 'blocked', 'inactive']:
        return jsonify({"error": "Status must be 'active', 'blocked', or 'inactive'"}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE users SET status = %s WHERE id = %s", (status, user_id))
        return jsonify({"message": f"User status updated to {status}"}), 200
    finally:
        conn.close()


@app.put("/api/admin/users/<int:user_id>/verification")
@token_required
@role_required('admin')
def admin_toggle_user_verification(current_user, user_id):
    data = request.get_json(silent=True) or {}
    verification_status = data.get("verification_status", "").strip().lower()

    if verification_status not in ['verified', 'rejected', 'pending']:
        return jsonify({"error": "Status must be 'verified', 'rejected', or 'pending'"}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE users SET verification_status = %s WHERE id = %s", (verification_status, user_id))
            cur.execute("""
                INSERT INTO notifications (user_id, title, message)
                VALUES (%s, %s, %s)
            """, (
                user_id,
                f"Account Verification: {verification_status.capitalize()}",
                f"Your business profile verification status has been updated to '{verification_status}' by Administration."
            ))
        return jsonify({"message": f"User verification updated to {verification_status}"}), 200
    finally:
        conn.close()


# ==========================================
# 15. DOCUMENT GENERATOR (INVOICE & DO)
# ==========================================

@app.post("/api/documents/generate")
@token_required
def generate_invoice_or_do(current_user):
    """
    Generates a formal, printable Commercial Freight Invoice and/or Delivery Order (DO)
    for a shipment or product, saves it securely to disk, and records it in MySQL.
    """
    data = request.get_json(silent=True) or {}
    raw_type = (data.get("document_type") or data.get("doc_type") or "invoice").strip().lower()
    doc_type = 'delivery_order' if raw_type in ['do', 'delivery_order'] else 'invoice'

    shipment_id = data.get("shipment_id") or None
    product_name = data.get("product_name", "Commercial Freight Cargo").strip()
    quantity_tons = float(data.get("quantity_tons", 1.0))
    rate_per_ton = float(data.get("rate_per_ton", 0.0))
    base_amount = float(data.get("base_amount", quantity_tons * rate_per_ton if rate_per_ton > 0 else 25000.0))
    
    gst_rate = float(data.get("gst_rate", 18.0))
    gst_amount = round(base_amount * (gst_rate / 100.0), 2)
    total_amount = round(base_amount + gst_amount, 2)

    consignor_name = data.get("consignor_name", current_user.get("company_name", "Shipper Company")).strip()
    consignor_gst = data.get("consignor_gst", current_user.get("gst_number", "27AAAAA1234A1Z1")).strip()
    consignor_address = data.get("consignor_address", "Industrial Estate, Navi Mumbai").strip()

    consignee_name = data.get("consignee_name", "Consignee Logistics Ltd").strip()
    consignee_gst = data.get("consignee_gst", "27BBBBB5678B1Z2").strip()
    consignee_address = data.get("consignee_address", "MIDC Industrial Hub, Pune").strip()

    transporter_name = data.get("transporter_name", "Apex Freight Carriers").strip()
    vehicle_number = data.get("vehicle_number", "MH-04-AB-1234").strip()
    driver_name = data.get("driver_name", "Commercial Driver").strip()
    eway_bill = data.get("eway_bill", f"EWB-2026-{random.randint(10000000, 99999999)}").strip()
    doc_number = data.get("doc_number", f"{'INV' if doc_type == 'invoice' else 'DO'}-2026-{random.randint(1000, 9999)}").strip()
    created_date = datetime.date.today().strftime('%d-%b-%Y')

    # Build print-ready HTML
    is_invoice = (doc_type == 'invoice')
    title = "COMMERCIAL TAX INVOICE (FREIGHT)" if is_invoice else "DELIVERY ORDER (DO) & GATE PASS"

    if is_invoice:
        middle_table = f"""
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Cargo Description</th>
          <th>HSN/SAC</th>
          <th>Tonnage / Qty</th>
          <th>Rate / Ton</th>
          <th style="text-align: right;">Amount (₹)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>1</td>
          <td><strong>{product_name}</strong><br><small style="color: #64748b;">Road Freight Services (SAC 996511)</small></td>
          <td>996511</td>
          <td>{quantity_tons} Tons</td>
          <td>₹{rate_per_ton if rate_per_ton > 0 else (base_amount / quantity_tons):,.2f}</td>
          <td style="text-align: right;">₹{base_amount:,.2f}</td>
        </tr>
      </tbody>
    </table>

    <div class="totals">
      <table>
        <tr>
          <td>Sub Total:</td>
          <td style="text-align: right;">₹{base_amount:,.2f}</td>
        </tr>
        <tr>
          <td>GST ({gst_rate}%):</td>
          <td style="text-align: right;">₹{gst_amount:,.2f}</td>
        </tr>
        <tr style="font-size: 16px; font-weight: bold; border-top: 2px solid #0f172a;">
          <td>Total Payable:</td>
          <td style="text-align: right; color: #0284c7;">₹{total_amount:,.2f}</td>
        </tr>
      </table>
    </div>
        """
    else:
        middle_table = f"""
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Product / Commodity</th>
          <th>Packing Type</th>
          <th>Net Weight</th>
          <th>Gross Weight</th>
          <th>Inspection Status</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>1</td>
          <td><strong>{product_name}</strong></td>
          <td>Industrial Standard Bundles / Pallets</td>
          <td>{quantity_tons} Tons</td>
          <td>{round(quantity_tons * 1.03, 2)} Tons</td>
          <td><span style="color: #16a34a; font-weight: bold;">✔ Passed Security & Quality Check</span></td>
        </tr>
      </tbody>
    </table>

    <div class="panel" style="margin-top: 20px;">
      <h4>Dispatch & Material Movement Authorization</h4>
      <p style="margin: 0; font-size: 13px; color: #334155;">
        This document authorizes the listed vehicle and carrier to receive, transport, and hand over the above-specified consignments from <strong>{consignor_name}</strong> to the designated receiving yard at <strong>{consignee_name}</strong>. Gate security is instructed to clear the vehicle after recording outward weighbridge readings.
      </p>
    </div>
        """

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{title} - {doc_number}</title>
  <style>
    body {{ font-family: 'Segoe UI', Arial, sans-serif; margin: 30px; color: #1e293b; line-height: 1.5; }}
    .doc-box {{ border: 2px solid #0f172a; padding: 25px; max-width: 800px; margin: 0 auto; }}
    .header {{ display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 15px; margin-bottom: 20px; }}
    .title {{ font-size: 20px; font-weight: 800; color: #0284c7; text-transform: uppercase; letter-spacing: 1px; }}
    .badge {{ background: #e0f2fe; color: #0369a1; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 12px; }}
    .grid-2 {{ display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; font-size: 13px; }}
    .panel {{ background: #f8fafc; border: 1px solid #cbd5e1; padding: 12px; border-radius: 6px; }}
    .panel h4 {{ margin: 0 0 6px 0; color: #334155; font-size: 14px; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px; }}
    th {{ background: #0f172a; color: white; padding: 8px 10px; text-align: left; }}
    td {{ padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }}
    .totals {{ margin-top: 20px; display: flex; justify-content: flex-end; font-size: 14px; }}
    .totals table {{ width: 320px; }}
    .totals td {{ padding: 5px 8px; }}
    .footer {{ margin-top: 35px; display: flex; justify-content: space-between; padding-top: 20px; border-top: 1px solid #cbd5e1; font-size: 12px; }}
    .stamp {{ border: 2px dashed #0284c7; color: #0284c7; padding: 8px 14px; display: inline-block; font-weight: bold; text-align: center; border-radius: 6px; }}
    @media print {{ body {{ margin: 0; }} .no-print {{ display: none; }} }}
  </style>
</head>
<body>
  <div class="no-print" style="text-align: center; margin-bottom: 20px;">
    <button onclick="window.print()" style="padding: 10px 24px; background: #0284c7; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 14px;">🖨️ Print / Save as PDF</button>
  </div>

  <div class="doc-box">
    <div class="header">
      <div>
        <div class="title">{title}</div>
        <small style="color: #64748b;">TranceConnect-Prime Verified Transit Network</small>
      </div>
      <div style="text-align: right;">
        <div><strong>Doc Ref:</strong> {doc_number}</div>
        <div><strong>Date:</strong> {created_date}</div>
        <div><span class="badge">E-WAY BILL: {eway_bill}</span></div>
      </div>
    </div>

    <div class="grid-2">
      <div class="panel">
        <h4>Consignor / Shipper (Billed From)</h4>
        <strong>{consignor_name}</strong><br>
        Address: {consignor_address}<br>
        GSTIN: <strong>{consignor_gst}</strong>
      </div>
      <div class="panel">
        <h4>Consignee / Destination (Shipped To)</h4>
        <strong>{consignee_name}</strong><br>
        Address: {consignee_address}<br>
        GSTIN: <strong>{consignee_gst}</strong>
      </div>
    </div>

    <div class="panel" style="margin-bottom: 20px;">
      <h4>Transport & Vehicle Authorization</h4>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); font-size: 13px;">
        <div><strong>Transporter:</strong> {transporter_name}</div>
        <div><strong>Vehicle Reg No:</strong> {vehicle_number}</div>
        <div><strong>Driver Name:</strong> {driver_name}</div>
      </div>
    </div>

    {middle_table}

    <div class="footer">
      <div>
        <div class="stamp">
          TRANCECONNECT-PRIME<br>
          OFFICIALLY VERIFIED
        </div>
        <div style="margin-top: 8px; color: #64748b;">Authenticity Hash: {uuid.uuid4().hex[:16].upper()}</div>
      </div>
      <div style="text-align: right;">
        <br><br>
        <div style="border-top: 1px dashed #64748b; width: 200px; display: inline-block;"></div>
        <div>Authorized Signatory / Warehouse Seal</div>
      </div>
    </div>
  </div>
</body>
</html>
"""

    # Save to disk
    stored_name = f"{doc_type}_{doc_number}_{uuid.uuid4().hex[:8]}.html"
    file_path = os.path.join(UPLOAD_DIR, 'documents', stored_name)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(html_content)

    file_size = os.path.getsize(file_path)

    # Save in database
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO documents (user_id, shipment_id, document_type, file_name, file_path, file_size, mime_type, verification_status)
                VALUES (%s, %s, %s, %s, %s, %s, 'text/html', 'verified')
            """, (current_user['id'], shipment_id, doc_type, f"{title} - {doc_number}.html", stored_name, file_size))
            doc_id = cur.lastrowid

            # If shipment_id provided, update shipments table
            if shipment_id:
                if doc_type == 'invoice':
                    cur.execute("UPDATE shipments SET invoice_document = %s WHERE id = %s", (stored_name, shipment_id))
                else:
                    cur.execute("UPDATE shipments SET do_document = %s WHERE id = %s", (stored_name, shipment_id))

        return jsonify({
            "message": f"{title} #{doc_number} generated and stored successfully!",
            "document_id": doc_id,
            "document_type": doc_type,
            "doc_number": doc_number,
            "download_url": f"/api/documents/{doc_id}/download"
        }), 201
    finally:
        conn.close()


# ==========================================
# 16. DATABASE EXPLORER / INSPECTOR API
# ==========================================

@app.get("/api/admin/db-inspect")
@token_required
@role_required('admin')
def admin_db_inspect(current_user):
    """
    Returns full database overview with table row counts and latest records for direct inspection.
    """
    conn = get_db_connection()
    try:
        tables = [
            'users', 'shipments', 'vehicles', 'drivers', 'documents',
            'invoices', 'invoice_items', 'delivery_orders', 'delivery_order_items', 'document_audit_logs',
            'messages', 'notifications', 'tracking_records', 'password_resets'
        ]
        db_overview = {}

        with conn.cursor() as cur:
            for tbl in tables:
                cur.execute(f"SELECT COUNT(*) AS total_rows FROM `{tbl}`")
                row_count = cur.fetchone()['total_rows']

                cur.execute(f"DESCRIBE `{tbl}`")
                cols = cur.fetchall()

                cur.execute(f"SELECT * FROM `{tbl}` ORDER BY id DESC LIMIT 10")
                sample_data = cur.fetchall()

                db_overview[tbl] = {
                    "table_name": tbl,
                    "row_count": row_count,
                    "columns": [c['Field'] for c in cols],
                    "records": sample_data
                }

        return jsonify({
            "database_name": os.getenv("DATABASE_NAME", "transconnectlinkx"),
            "host": os.getenv("DATABASE_HOST", "localhost"),
            "port": int(os.getenv("DATABASE_PORT", 3306)),
            "tables": db_overview,
            "inspected_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }), 200
    finally:
        conn.close()

@app.errorhandler(404)
def not_found(e):
    if request.path.startswith('/api/'):
        return jsonify({"error": "API route not found", "path": request.path}), 404
    return send_from_directory(FRONTEND_DIR, 'index.html')

@app.errorhandler(413)
def request_entity_too_large(e):
    return jsonify({"error": "Uploaded file is too large. Maximum size is 16 MB."}), 413

@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": "Internal server error", "detail": str(e)}), 500


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
