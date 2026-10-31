import uuid
import pytest

def test_health_check(client):
    res = client.get('/api/health')
    assert res.status_code == 200
    data = res.get_json()
    assert data['status'] == 'healthy'
    assert data['database']['connected'] is True

def test_dealer_registration_success(client):
    rand_suffix = uuid.uuid4().hex[:6]
    email = f"dealer_{rand_suffix}@example.com"
    mobile = f"98{uuid.uuid4().int % 100000000:08d}"

    payload = {
        'role': 'dealer',
        'company_name': f'Omega Steel {rand_suffix}',
        'contact_person': 'Rohan Shah',
        'mobile': mobile,
        'email': email,
        'gstin': '27ABCDE1234F1Z5',
        'password': 'SecurePass@123',
        'confirm_password': 'SecurePass@123',
        'city': 'Mumbai',
        'state': 'Maharashtra'
    }

    res = client.post('/api/auth/register', json=payload)
    assert res.status_code in [200, 201], res.get_json()
    data = res.get_json()
    assert 'token' in data
    assert data['user']['role'] == 'dealer'
    assert data['user']['email'] == email

def test_transporter_registration_success(client):
    rand_suffix = uuid.uuid4().hex[:6]
    email = f"trans_{rand_suffix}@example.com"
    mobile = f"97{uuid.uuid4().int % 100000000:08d}"

    payload = {
        'role': 'transporter',
        'company_name': f'Swift Express {rand_suffix}',
        'contact_person': 'Vikram Rathore',
        'mobile': mobile,
        'email': email,
        'password': 'SecurePass@123',
        'confirm_password': 'SecurePass@123',
        'city': 'Pune',
        'state': 'Maharashtra'
    }

    res = client.post('/api/auth/register', json=payload)
    assert res.status_code in [200, 201], res.get_json()
    data = res.get_json()
    assert 'token' in data
    assert data['user']['role'] == 'transporter'

def test_registration_duplicate_email(client):
    payload = {
        'role': 'dealer',
        'company_name': 'Duplicate Corp',
        'mobile': '9811122233',
        'email': 'dealer@tranceconnect.com',  # seeded email
        'password': 'Pass@123456',
        'confirm_password': 'Pass@123456'
    }
    res = client.post('/api/auth/register', json=payload)
    assert res.status_code == 409
    assert 'already registered' in res.get_json()['error'].lower()

def test_registration_invalid_mobile(client):
    payload = {
        'role': 'dealer',
        'company_name': 'Bad Mobile Co',
        'mobile': '12345',  # invalid
        'email': 'badmobile@example.com',
        'password': 'Pass@123456',
        'confirm_password': 'Pass@123456'
    }
    res = client.post('/api/auth/register', json=payload)
    assert res.status_code == 400
    assert 'mobile' in res.get_json()['error'].lower()

def test_registration_password_mismatch(client):
    payload = {
        'role': 'dealer',
        'company_name': 'Mismatch Co',
        'mobile': '9822334455',
        'email': 'mismatch@example.com',
        'password': 'Pass@123456',
        'confirm_password': 'DifferentPassword@123'
    }
    res = client.post('/api/auth/register', json=payload)
    assert res.status_code == 400
    assert 'not match' in res.get_json()['error'].lower()

def test_registration_prevents_admin_role(client):
    payload = {
        'role': 'admin',  # forbidden
        'company_name': 'Hacker Co',
        'mobile': '9899887766',
        'email': 'hacker@example.com',
        'password': 'Pass@123456',
        'confirm_password': 'Pass@123456'
    }
    res = client.post('/api/auth/register', json=payload)
    assert res.status_code == 400

def test_login_incorrect_password(client):
    res = client.post('/api/auth/login', json={
        'email': 'dealer@tranceconnect.com',
        'password': 'WrongPassword123'
    })
    assert res.status_code == 401

def test_login_nonexistent_user(client):
    res = client.post('/api/auth/login', json={
        'email': 'nonexistent@tranceconnect.com',
        'password': 'SomePassword123'
    })
    assert res.status_code == 401

def test_protected_route_without_token(client):
    res = client.get('/api/auth/me')
    assert res.status_code == 401

def test_protected_route_with_token(client, dealer_token):
    res = client.get('/api/auth/me', headers={'Authorization': f'Bearer {dealer_token}'})
    assert res.status_code == 200
    data = res.get_json()
    assert data['user']['role'] == 'dealer'
    assert data['user']['email'] == 'dealer@tranceconnect.com'

def test_role_based_access_forbidden(client, dealer_token):
    # Dealer trying to access admin endpoint
    res = client.get('/api/admin/users', headers={'Authorization': f'Bearer {dealer_token}'})
    assert res.status_code == 403

def test_admin_access_allowed(client, admin_token):
    res = client.get('/api/admin/users', headers={'Authorization': f'Bearer {admin_token}'})
    assert res.status_code == 200
    data = res.get_json()
    assert 'users' in data
    assert len(data['users']) > 0

def test_forgot_password_and_otp_flow(client):
    import time
    # Register a dedicated unique user for forgot password testing so seeded accounts remain pristine
    ts = int(time.time())
    test_email = f"forgot_{ts}@example.com"
    test_mobile = f"98{str(ts)[-8:]}"
    reg_res = client.post('/api/auth/register', json={
        'role': 'dealer',
        'company_name': 'OTP Test Logistics',
        'contact_person': 'OTP Tester',
        'email': test_email,
        'mobile': test_mobile,
        'password': 'InitialPass@123',
        'confirm_password': 'InitialPass@123'
    })
    assert reg_res.status_code == 201

    # 1. Request OTP
    res = client.post('/api/auth/forgot-password', json={'email': test_email})
    assert res.status_code == 200
    data = res.get_json()
    assert 'message' in data
    # When SMTP is not configured, backend returns the otp for testing
    otp = data.get('otp')
    assert otp is not None
    assert len(str(otp)) == 6

    # 2. Verify OTP
    v_res = client.post('/api/auth/verify-otp', json={
        'email': test_email,
        'otp': otp
    })
    assert v_res.status_code == 200
    v_data = v_res.get_json()
    reset_token = v_data.get('reset_session_token') or v_data.get('reset_token')
    assert reset_token is not None

    # 3. Reset Password
    r_res = client.post('/api/auth/reset-password', json={
        'email': test_email,
        'reset_session_token': reset_token,
        'new_password': 'UpdatedPass@123',
        'confirm_password': 'UpdatedPass@123'
    })
    assert r_res.status_code == 200

    # 4. Verify login with updated password
    l_res = client.post('/api/auth/login', json={
        'email': test_email,
        'password': 'UpdatedPass@123'
    })
    assert l_res.status_code == 200
    assert 'token' in l_res.get_json()

def test_firebase_login_existing_user(client):
    res = client.post('/api/auth/firebase-login', json={
        'email': 'dealer@tranceconnect.com',
        'display_name': 'Dealer Bharat Steel',
        'role': 'dealer'
    })
    assert res.status_code == 200
    data = res.get_json()
    assert 'token' in data
    assert data['user']['email'] == 'dealer@tranceconnect.com'
    assert data['user']['role'] == 'dealer'

def test_firebase_login_new_user_provisioning(client):
    import time
    new_email = f"google_user_{int(time.time())}@example.com"
    res = client.post('/api/auth/firebase-login', json={
        'email': new_email,
        'display_name': 'Yash Cloud Logistics',
        'role': 'transporter'
    })
    assert res.status_code == 200
    data = res.get_json()
    assert 'token' in data
    assert data['user']['email'] == new_email
    assert data['user']['role'] == 'transporter'

    # Verify token works on protected endpoint
    token = data['token']
    me_res = client.get('/api/auth/me', headers={'Authorization': f'Bearer {token}'})
    assert me_res.status_code == 200
    assert me_res.get_json()['user']['email'] == new_email


def test_dashboard_routes_and_aliases(client):
    """Verifies that all dashboard routes and aliases serve valid HTML."""
    for path in ['/dealer', '/transporter', '/transport', '/admin']:
        res = client.get(path)
        assert res.status_code == 200, f"Route {path} failed with status {res.status_code}"
        assert b'<!DOCTYPE html>' in res.data or b'<html' in res.data

def test_auth_profile_endpoint_alias(client):
    """Verifies /api/auth/profile works identically to /api/auth/me."""
    # Unauthenticated
    unauth = client.get('/api/auth/profile')
    assert unauth.status_code == 401

    # Authenticated
    login_res = client.post('/api/auth/login', json={
        'identifier': 'admin',
        'password': 'Admin@123456'
    })
    assert login_res.status_code == 200
    token = login_res.get_json()['token']

    res = client.get('/api/auth/profile', headers={'Authorization': f'Bearer {token}'})
    assert res.status_code == 200
    data = res.get_json()
    assert 'user' in data
    assert data['user']['role'] == 'admin'
