import pytest
from backend.app import app, socketio

def test_socketio_connect_and_authenticate(dealer_token):
    test_client = socketio.test_client(app)
    assert test_client.is_connected()

    # Authenticate with dealer token
    test_client.emit('authenticate', {'token': dealer_token})
    
    auth_received = test_client.get_received()
    auth_events = [pkt for pkt in auth_received if pkt['name'] == 'authenticated']
    assert len(auth_events) > 0
    assert auth_events[0]['args'][0]['user']['email'] == 'dealer@tranceconnect.com'
    
    # Join tracking room
    test_client.emit('join_tracking', {'shipment_id': 1})
    test_client.emit('leave_tracking', {'shipment_id': 1})
    
    test_client.disconnect()
    assert not test_client.is_connected()

def test_socketio_chat_join_and_typing(dealer_token):
    test_client = socketio.test_client(app)
    test_client.emit('authenticate', {'token': dealer_token})
    test_client.get_received() # Clear queue

    test_client.emit('join_chat', {'shipment_id': 1})
    received = test_client.get_received()
    assert any(pkt['name'] == 'joined_chat' for pkt in received)

    test_client.emit('typing', {'shipment_id': 1, 'is_typing': True})
    test_client.disconnect()
