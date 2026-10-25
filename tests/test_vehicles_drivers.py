import uuid
import pytest

def test_transporter_list_vehicles(client, transporter_token):
    res = client.get('/api/vehicles', headers={'Authorization': f'Bearer {transporter_token}'})
    assert res.status_code == 200
    data = res.get_json()
    assert 'vehicles' in data
    assert len(data['vehicles']) > 0

def test_transporter_register_vehicle(client, transporter_token):
    rand_num = f"MH-14-{uuid.uuid4().hex[:2].upper()}-{uuid.uuid4().int % 9000 + 1000}"
    payload = {
        'vehicle_number': rand_num,
        'vehicle_type': '24ft Container Truck',
        'capacity_tons': 16.0,
        'current_location': 'Nigdi Pradhikaran, Pune'
    }
    res = client.post('/api/vehicles', json=payload, headers={'Authorization': f'Bearer {transporter_token}'})
    assert res.status_code == 201, res.get_json()
    data = res.get_json()
    assert 'vehicle_id' in data

def test_transporter_list_drivers(client, transporter_token):
    res = client.get('/api/drivers', headers={'Authorization': f'Bearer {transporter_token}'})
    assert res.status_code == 200
    data = res.get_json()
    assert 'drivers' in data
    assert len(data['drivers']) > 0

def test_transporter_add_driver(client, transporter_token):
    rand_lic = f"MH14{uuid.uuid4().int % 900000000000 + 100000000000}"
    payload = {
        'name': 'Kishore Salunkhe',
        'mobile': '9860112233',
        'license_number': rand_lic,
        'aadhaar_number': '554433221100'
    }
    res = client.post('/api/drivers', json=payload, headers={'Authorization': f'Bearer {transporter_token}'})
    assert res.status_code == 201, res.get_json()
    data = res.get_json()
    assert 'driver_id' in data
