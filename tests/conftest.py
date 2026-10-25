import os
import sys
import pytest

# Ensure project root is in sys.path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

# Force SQLite and testing mode
os.environ['TESTING'] = 'true'
os.environ['DB_TYPE'] = 'sqlite'
os.environ['SECRET_KEY'] = 'test-secret-key-tranceconnect-2026'
os.environ['JWT_SECRET'] = 'test-jwt-secret-tranceconnect-2026'

from backend.app import app
from backend.db import get_db_connection
from database.seed_live_data import seed_database

@pytest.fixture(scope='session', autouse=True)
def setup_test_database():
    """Seeds the test database before running tests."""
    seed_database()

@pytest.fixture
def client():
    """Provides Flask test client."""
    with app.test_client() as c:
        yield c

@pytest.fixture
def admin_token(client):
    """Provides valid JWT token for admin."""
    res = client.post('/api/auth/login', json={
        'email': 'admin@tranceconnect.com',
        'password': 'Admin@123456'
    })
    assert res.status_code == 200, res.get_json()
    return res.get_json()['token']

@pytest.fixture
def dealer_token(client):
    """Provides valid JWT token for dealer."""
    res = client.post('/api/auth/login', json={
        'email': 'dealer@tranceconnect.com',
        'password': 'Pass@123456'
    })
    assert res.status_code == 200, res.get_json()
    return res.get_json()['token']

@pytest.fixture
def transporter_token(client):
    """Provides valid JWT token for transporter."""
    res = client.post('/api/auth/login', json={
        'email': 'transporter@tranceconnect.com',
        'password': 'Pass@123456'
    })
    assert res.status_code == 200, res.get_json()
    return res.get_json()['token']
