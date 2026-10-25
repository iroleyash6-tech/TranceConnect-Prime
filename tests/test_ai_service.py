import pytest
from backend.ai_service import get_logistics_ai_reply

def test_ai_vehicle_sizing_small():
    reply = get_logistics_ai_reply("Which truck should I use for 2 tons of parcels?", user_role='dealer')
    assert "Tata 407" in reply or "Pickup" in reply

def test_ai_vehicle_sizing_heavy():
    reply = get_logistics_ai_reply("What vehicle is recommended for 25 tons of steel coils?", user_role='dealer')
    assert "32ft" in reply or "Multi-Axle" in reply

def test_ai_workflow_guidance():
    reply = get_logistics_ai_reply("Can you explain the workflow on this platform?", user_role='dealer')
    assert "Workflow" in reply
    assert "Shipment" in reply

def test_ai_documentation_rules():
    reply = get_logistics_ai_reply("What documents are needed for freight transport under GST?", user_role='transporter')
    assert "E-Way" in reply or "Invoice" in reply or "DO" in reply

def test_ai_assistant_api_endpoint(client, dealer_token):
    res = client.post('/api/ai/assistant', json={
        'prompt': 'Which truck is best for 15 tons of consumer goods?'
    }, headers={'Authorization': f'Bearer {dealer_token}'})
    assert res.status_code == 200
    data = res.get_json()
    assert 'reply' in data
    assert len(data['reply']) > 10
