import pytest

def test_dealer_create_shipment(client, dealer_token):
    payload = {
        'product_type': 'Automotive Component Castings',
        'transport_type': 'Full Truckload (FTL)',
        'weight_tons': 14.5,
        'vehicle_required': '20ft Container Truck',
        'pickup_location': 'Bhosari MIDC, Pune, Maharashtra',
        'delivery_location': 'Manesar Industrial Hub, Haryana',
        'pickup_date': '2026-11-01',
        'expected_delivery_date': '2026-11-04',
        'price_per_trip': 48000.00,
        'notes': 'Keep fragile components protected against moisture.'
    }

    res = client.post('/api/shipments', json=payload, headers={'Authorization': f'Bearer {dealer_token}'})
    assert res.status_code == 201, res.get_json()
    data = res.get_json()
    assert 'shipment_id' in data
    assert data['status'] == 'Pending'

def test_get_dealer_shipments(client, dealer_token):
    res = client.get('/api/shipments', headers={'Authorization': f'Bearer {dealer_token}'})
    assert res.status_code == 200
    data = res.get_json()
    assert 'shipments' in data
    assert len(data['shipments']) > 0

def test_transporter_view_available_shipments(client, transporter_token):
    res = client.get('/api/shipments', headers={'Authorization': f'Bearer {transporter_token}'})
    assert res.status_code == 200
    data = res.get_json()
    assert 'shipments' in data
    assert len(data['shipments']) > 0

def test_shipment_status_lifecycle(client, dealer_token, transporter_token):
    # 1. Create shipment
    create_res = client.post('/api/shipments', json={
        'product_type': 'Test Cement Bags',
        'transport_type': 'FTL',
        'weight_tons': 20.0,
        'vehicle_required': '32ft Multi-Axle Truck',
        'pickup_location': 'Mumbai',
        'delivery_location': 'Pune',
        'price_per_trip': 25000.00
    }, headers={'Authorization': f'Bearer {dealer_token}'})
    assert create_res.status_code == 201
    shipment_id = create_res.get_json()['shipment_id']

    # 2. Assign to transporter
    assign_res = client.put(f'/api/shipments/{shipment_id}/assign', json={
        'transporter_id': 2  # Apex Logistics
    }, headers={'Authorization': f'Bearer {dealer_token}'})
    assert assign_res.status_code == 200

    # 3. Transporter updates status to 'Accepted'
    status_res = client.put(f'/api/shipments/{shipment_id}/status', json={
        'status': 'Accepted'
    }, headers={'Authorization': f'Bearer {transporter_token}'})
    assert status_res.status_code == 200
    assert status_res.get_json()['status'] == 'Accepted'

    # 4. Transporter marks 'In Transit'
    transit_res = client.put(f'/api/shipments/{shipment_id}/status', json={
        'status': 'In Transit'
    }, headers={'Authorization': f'Bearer {transporter_token}'})
    assert transit_res.status_code == 200

    # 5. Transporter marks 'Delivered'
    delivered_res = client.put(f'/api/shipments/{shipment_id}/status', json={
        'status': 'Delivered'
    }, headers={'Authorization': f'Bearer {transporter_token}'})
    assert delivered_res.status_code == 200

def test_tracking_data_retrieval(client, dealer_token):
    res = client.get('/api/tracking/1', headers={'Authorization': f'Bearer {dealer_token}'})
    assert res.status_code == 200
    data = res.get_json()
    assert 'shipment' in data
    assert 'latest_location' in data
    assert 'history' in data
