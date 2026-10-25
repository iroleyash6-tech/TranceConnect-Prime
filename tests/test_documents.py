import uuid
import pytest

def test_dealer_create_invoice(client, dealer_token):
    inv_num = f"TC-INV-2026-{uuid.uuid4().hex[:6].upper()}"
    payload = {
        'invoice_number': inv_num,
        'invoice_date': '2026-10-25',
        'due_date': '2026-11-25',
        'place_of_supply': 'Maharashtra (27)',
        'payment_terms': 'Net 30 Days',
        'buyer_company': 'Tata Steel Processing & Distribution Ltd',
        'buyer_name': 'Sanjay Verma',
        'buyer_address': 'Plot 12, Pimpri Industrial MIDC, Pune',
        'buyer_mobile': '9822114455',
        'buyer_email': 'procurement@tatasteel.com',
        'buyer_gst': '27AAACT2727Q1ZW',
        'buyer_state': 'Maharashtra',
        'buyer_state_code': '27',
        'items': [
            {
                'item_name': 'High Tensile Steel Rebars 16mm',
                'description': 'Grade Fe 550D TMT Reinforcement Bars',
                'hsn_sac': '72142090',
                'quantity': 10.0,
                'unit': 'Tons',
                'rate': 55000.00,
                'discount': 0.0,
                'gst_rate': 18.0
            }
        ],
        'notes': 'Goods delivered in sound condition.',
        'terms_conditions': 'Interest @ 18% p.a. charged if payment delayed beyond 30 days.'
    }

    res = client.post('/api/invoices', json=payload, headers={'Authorization': f'Bearer {dealer_token}'})
    assert res.status_code == 201, res.get_json()
    data = res.get_json()
    assert 'invoice_id' in data
    assert data['invoice_number'] == inv_num

def test_dealer_list_invoices(client, dealer_token):
    res = client.get('/api/invoices', headers={'Authorization': f'Bearer {dealer_token}'})
    assert res.status_code == 200
    data = res.get_json()
    assert 'invoices' in data

def test_dealer_create_delivery_order(client, dealer_token):
    do_num = f"TC-DO-2026-{uuid.uuid4().hex[:6].upper()}"
    payload = {
        'do_number': do_num,
        'do_date': '2026-10-25',
        'valid_until': '2026-10-28',
        'consignee_company': 'Reliance Retail Distribution Hub',
        'consignee_address': 'Building B-4, Logistics Park, Bhiwandi, Thane',
        'consignee_contact': 'Mahesh Joshi',
        'consignee_mobile': '9820335577',
        'consignee_gst': '27AABCR4455P1Z0',
        'pickup_location': 'JNPT CFS Dock 2, Navi Mumbai',
        'delivery_location': 'Bhiwandi Hub 4, Thane',
        'product_type': 'Packaged FMCG Consumer Goods',
        'total_weight': 12.5,
        'total_quantity': 450.0,
        'items': [
            {
                'product_description': 'Consumer Goods Standard Master Cartons',
                'quantity': 450.0,
                'unit': 'Cartons',
                'weight': 12.5,
                'package_type': 'Palletized'
            }
        ],
        'delivery_instructions': 'Verify outward seal before offloading.',
        'authorized_signatory': 'Logistics Operations Head'
    }

    res = client.post('/api/delivery-orders', json=payload, headers={'Authorization': f'Bearer {dealer_token}'})
    assert res.status_code == 201, res.get_json()
    data = res.get_json()
    assert 'do_id' in data

def test_dealer_list_delivery_orders(client, dealer_token):
    res = client.get('/api/delivery-orders', headers={'Authorization': f'Bearer {dealer_token}'})
    assert res.status_code == 200
    data = res.get_json()
    assert 'delivery_orders' in data

def test_public_qr_verification_invoice(client, dealer_token):
    inv_num = f"TC-INV-VERIFY-{uuid.uuid4().hex[:6].upper()}"
    client.post('/api/invoices', json={
        'invoice_number': inv_num,
        'invoice_date': '2026-10-25',
        'buyer_company': 'Public Test Buyer',
        'buyer_address': 'Mumbai',
        'items': [{'item_name': 'Iron Rods', 'quantity': 1, 'unit': 'Tons', 'rate': 10000, 'gst_rate': 18}]
    }, headers={'Authorization': f'Bearer {dealer_token}'})

    # Public endpoint without auth token
    res = client.get(f'/api/verify/invoice/{inv_num}')
    assert res.status_code == 200
    data = res.get_json()
    assert data['verified'] is True
    assert data['invoice_number'] == inv_num

def test_invoice_and_do_pdf_download(client, dealer_token):
    # 1. Create Invoice and download PDF
    inv_num = f"TC-PDF-{uuid.uuid4().hex[:6].upper()}"
    inv_res = client.post('/api/invoices', json={
        'invoice_number': inv_num,
        'invoice_date': '2026-10-25',
        'buyer_company': 'PDF Test Receiver Ltd',
        'buyer_address': 'Pune Auto Cluster',
        'items': [{'item_name': 'Precision Machined Flanges', 'quantity': 100, 'unit': 'Pieces', 'rate': 450, 'gst_rate': 18}]
    }, headers={'Authorization': f'Bearer {dealer_token}'})
    assert inv_res.status_code == 201
    inv_id = inv_res.get_json()['invoice_id']

    pdf_res = client.get(f'/api/invoices/{inv_id}/pdf', headers={'Authorization': f'Bearer {dealer_token}'})
    assert pdf_res.status_code == 200
    assert pdf_res.mimetype == 'application/pdf'
    assert pdf_res.data.startswith(b'%PDF')

    # 2. Create DO and download PDF
    do_num = f"TC-DO-PDF-{uuid.uuid4().hex[:6].upper()}"
    do_res = client.post('/api/delivery-orders', json={
        'do_number': do_num,
        'consignee_company': 'PDF Consignee Warehouse Ltd',
        'consignee_address': 'Plot 45, Bhiwandi Logistics Hub, Thane',
        'delivery_location': 'Bhiwandi Hub',
        'product_type': 'Machined Flanges',
        'items': [{'product_description': 'Flanges Box', 'quantity': 10, 'unit': 'Boxes', 'weight': 1.5}]
    }, headers={'Authorization': f'Bearer {dealer_token}'})
    assert do_res.status_code == 201
    do_id = do_res.get_json()['do_id']

    do_pdf_res = client.get(f'/api/delivery-orders/{do_id}/pdf', headers={'Authorization': f'Bearer {dealer_token}'})
    assert do_pdf_res.status_code == 200
    assert do_pdf_res.mimetype == 'application/pdf'
    assert do_pdf_res.data.startswith(b'%PDF')
