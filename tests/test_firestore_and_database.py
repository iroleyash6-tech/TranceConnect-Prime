import pytest
import uuid
from backend.firestore_sync import (
    sync_user_to_firestore,
    sync_shipment_to_firestore,
    sync_tracking_to_firestore,
    sync_notification_to_firestore
)
from backend.db import get_db_connection

def test_api_health_endpoint_contract(client):
    """Verifies that /api/health strictly returns the required JSON structure."""
    res = client.get('/api/health')
    assert res.status_code == 200
    data = res.get_json()
    assert data['success'] is True
    assert data['service'] == "TranceConnect-Pro API"
    assert data['status'] == "healthy"
    assert 'database' in data
    assert data['database']['connected'] is True

def test_api_404_json_error_response(client):
    """Verifies that non-existent API routes return structured JSON, never HTML."""
    res = client.get('/api/non-existent-route-audit')
    assert res.status_code == 404
    data = res.get_json()
    assert data is not None
    assert data['success'] is False
    assert 'message' in data or 'error' in data

def test_api_405_method_not_allowed_json(client):
    """Verifies that method not allowed returns JSON with success: False."""
    res = client.post('/api/health')
    assert res.status_code == 405
    data = res.get_json()
    assert data is not None
    assert data['success'] is False

def test_firestore_sync_helpers_resilience():
    """Verifies that firestore sync helper methods execute cleanly without throwing."""
    # Test user sync
    res_user = sync_user_to_firestore({
        'id': 9999,
        'email': 'audit_test@example.com',
        'role': 'dealer',
        'company_name': 'Audit Corp'
    })
    assert isinstance(res_user, bool)

    # Test shipment sync
    res_ship = sync_shipment_to_firestore({
        'id': 8888,
        'dealer_id': 9999,
        'pickup_location': 'Mumbai',
        'delivery_location': 'Delhi',
        'status': 'Pending'
    })
    assert isinstance(res_ship, bool)

    # Test tracking sync
    res_track = sync_tracking_to_firestore(8888, 19.0760, 72.8777, speed=55.0, heading=90.0, status='In Transit')
    assert isinstance(res_track, bool)

    # Test notification sync
    res_notif = sync_notification_to_firestore(9999, 'Test Alert', 'Consignment has departed.')
    assert isinstance(res_notif, bool)

def test_database_permanent_persistence_user_and_shipment(client, dealer_token):
    """Verifies that user data and shipment consignments persist in the authoritative database."""
    conn = get_db_connection()
    try:
        # Create shipment via API
        payload = {
            'product_type': 'Industrial Cement Bags',
            'transport_type': 'Full Truckload (FTL)',
            'weight_tons': 24.5,
            'vehicle_required': '24-Foot Multi-Axle Truck',
            'pickup_location': 'Nagpur Plant, Maharashtra',
            'delivery_location': 'Surat Hub, Gujarat',
            'pickup_date': '2026-11-01',
            'expected_delivery_date': '2026-11-03',
            'price_per_trip': 48000.00,
            'notes': 'Fragile cement bags, moisture protection required.'
        }
        res = client.post('/api/shipments', json=payload, headers={'Authorization': f'Bearer {dealer_token}'})
        assert res.status_code in [200, 201], res.get_json()
        shipment_id = res.get_json()['shipment_id']

        # Verify direct read from database
        with conn.cursor() as cur:
            cur.execute("SELECT id, product_type, weight_tons, status FROM shipments WHERE id = %s", (shipment_id,))
            record = cur.fetchone()
            assert record is not None
            assert record['id'] == shipment_id
            assert record['product_type'] == 'Industrial Cement Bags'
            assert float(record['weight_tons']) == 24.5
            assert record['status'] == 'Pending'
    finally:
        conn.close()

def test_database_permanent_persistence_transporter_vehicle(client, transporter_token):
    """Verifies vehicle registration saves permanently to database."""
    conn = get_db_connection()
    try:
        v_num = f"MH12TC{uuid.uuid4().hex[:4].upper()}"
        payload = {
            'vehicle_number': v_num,
            'vehicle_type': 'Multi-Axle 32FT Container',
            'capacity_tons': 28.0,
            'current_location': 'Pune Depot',
            'status': 'available'
        }
        res = client.post('/api/vehicles', json=payload, headers={'Authorization': f'Bearer {transporter_token}'})
        assert res.status_code in [200, 201], res.get_json()

        # Direct database query
        with conn.cursor() as cur:
            cur.execute("SELECT id, vehicle_number, capacity_tons FROM vehicles WHERE vehicle_number = %s", (v_num,))
            veh = cur.fetchone()
            assert veh is not None
            assert veh['vehicle_number'] == v_num
            assert float(veh['capacity_tons']) == 28.0
    finally:
        conn.close()
