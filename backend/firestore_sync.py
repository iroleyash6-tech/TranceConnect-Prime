"""
TRANCECONNECT-PRO: FIRESTORE HYBRID SYNC ADAPTER
Synchronizes MySQL/SQLite relational transactions with Google Cloud Firestore
for real-time multi-client state propagation, GPS streaming, and audit trails.
Project: transconnect-2fb2b (iroleyash6@gmail.com)
"""

import os
import datetime
import logging

logger = logging.getLogger("firestore_sync")

_firestore_client = None
_firestore_initialized = False

def get_firestore_client():
    global _firestore_client, _firestore_initialized
    if _firestore_initialized:
        return _firestore_client
    
    try:
        import firebase_admin
        from firebase_admin import firestore
        if firebase_admin._apps:
            _firestore_client = firestore.client()
            _firestore_initialized = True
            logger.info("⚡ Firestore client initialized successfully for transconnect-2fb2b")
        else:
            _firestore_initialized = True
            _firestore_client = None
    except Exception as e:
        logger.debug(f"Firestore client init bypassed: {e}")
        _firestore_client = None
        _firestore_initialized = True
        
    return _firestore_client


def sync_user_to_firestore(user_dict):
    """
    Synchronizes user document to Cloud Firestore 'users' collection.
    """
    client = get_firestore_client()
    if not client or not user_dict:
        return False
    try:
        uid = str(user_dict.get('id') or user_dict.get('email'))
        doc_data = {
            'id': user_dict.get('id'),
            'email': user_dict.get('email'),
            'role': user_dict.get('role'),
            'company_name': user_dict.get('company_name'),
            'contact_person': user_dict.get('contact_person'),
            'mobile': user_dict.get('mobile'),
            'city': user_dict.get('city'),
            'is_verified': bool(user_dict.get('is_verified', False)),
            'updated_at': datetime.datetime.utcnow().isoformat() + "Z"
        }
        client.collection('users').document(uid).set(doc_data, merge=True)
        return True
    except Exception as e:
        logger.warning(f"Failed to sync user {user_dict.get('email')} to Firestore: {e}")
        return False


def sync_shipment_to_firestore(shipment_dict):
    """
    Synchronizes shipment state to Cloud Firestore 'shipments' collection.
    """
    client = get_firestore_client()
    if not client or not shipment_dict:
        return False
    try:
        shipment_id = str(shipment_dict.get('id'))
        doc_data = dict(shipment_dict)
        doc_data['synced_at'] = datetime.datetime.utcnow().isoformat() + "Z"
        client.collection('shipments').document(shipment_id).set(doc_data, merge=True)
        return True
    except Exception as e:
        logger.warning(f"Failed to sync shipment {shipment_dict.get('id')} to Firestore: {e}")
        return False


def sync_tracking_to_firestore(shipment_id, lat, lng, speed=0.0, heading=0.0, status='in_transit'):
    """
    Publishes live GPS tracking coordinates to Firestore for instant mobile/desktop map rendering.
    """
    client = get_firestore_client()
    if not client:
        return False
    try:
        tracking_doc = {
            'shipment_id': shipment_id,
            'latitude': float(lat),
            'longitude': float(lng),
            'speed': float(speed),
            'heading': float(heading),
            'status': status,
            'timestamp': datetime.datetime.utcnow().isoformat() + "Z"
        }
        client.collection('tracking_locations').document(str(shipment_id)).set(tracking_doc, merge=True)
        return True
    except Exception as e:
        logger.warning(f"Failed to sync tracking for shipment {shipment_id} to Firestore: {e}")
        return False


def sync_notification_to_firestore(recipient_id, title, message, category='system'):
    """
    Pushes an alert or notification to the user's Firestore notification stream.
    """
    client = get_firestore_client()
    if not client:
        return False
    try:
        notif_doc = {
            'recipient_id': recipient_id,
            'title': title,
            'message': message,
            'category': category,
            'is_read': False,
            'timestamp': datetime.datetime.utcnow().isoformat() + "Z"
        }
        client.collection('notifications').add(notif_doc)
        return True
    except Exception as e:
        logger.warning(f"Failed to push notification to Firestore: {e}")
        return False


def sync_vehicle_to_firestore(vehicle_dict):
    """
    Synchronizes vehicle entity to Cloud Firestore 'vehicles' collection.
    """
    client = get_firestore_client()
    if not client or not vehicle_dict:
        return False
    try:
        vid = str(vehicle_dict.get('id'))
        doc_data = dict(vehicle_dict)
        doc_data['synced_at'] = datetime.datetime.utcnow().isoformat() + "Z"
        client.collection('vehicles').document(vid).set(doc_data, merge=True)
        return True
    except Exception as e:
        logger.warning(f"Failed to sync vehicle {vehicle_dict.get('id')} to Firestore: {e}")
        return False


def sync_booking_to_firestore(booking_dict):
    """
    Synchronizes booking request/acceptance state to Cloud Firestore 'bookings' collection.
    """
    client = get_firestore_client()
    if not client or not booking_dict:
        return False
    try:
        bid = str(booking_dict.get('id'))
        doc_data = dict(booking_dict)
        doc_data['synced_at'] = datetime.datetime.utcnow().isoformat() + "Z"
        client.collection('bookings').document(bid).set(doc_data, merge=True)
        return True
    except Exception as e:
        logger.warning(f"Failed to sync booking {booking_dict.get('id')} to Firestore: {e}")
        return False


def sync_invoice_to_firestore(invoice_dict):
    """
    Synchronizes invoice entity to Cloud Firestore 'invoices' collection.
    """
    client = get_firestore_client()
    if not client or not invoice_dict:
        return False
    try:
        iid = str(invoice_dict.get('id') or invoice_dict.get('invoice_number'))
        doc_data = dict(invoice_dict)
        doc_data['synced_at'] = datetime.datetime.utcnow().isoformat() + "Z"
        client.collection('invoices').document(iid).set(doc_data, merge=True)
        return True
    except Exception as e:
        logger.warning(f"Failed to sync invoice {invoice_dict.get('id')} to Firestore: {e}")
        return False


def sync_delivery_order_to_firestore(do_dict):
    """
    Synchronizes delivery order entity to Cloud Firestore 'delivery_orders' collection.
    """
    client = get_firestore_client()
    if not client or not do_dict:
        return False
    try:
        doid = str(do_dict.get('id') or do_dict.get('do_number'))
        doc_data = dict(do_dict)
        doc_data['synced_at'] = datetime.datetime.utcnow().isoformat() + "Z"
        client.collection('delivery_orders').document(doid).set(doc_data, merge=True)
        return True
    except Exception as e:
        logger.warning(f"Failed to sync DO {do_dict.get('id')} to Firestore: {e}")
        return False


def sync_message_to_firestore(msg_dict):
    """
    Synchronizes realtime dispatch messages to Cloud Firestore 'messages' and 'conversations' collections.
    """
    client = get_firestore_client()
    if not client or not msg_dict:
        return False
    try:
        mid = str(msg_dict.get('id') or datetime.datetime.utcnow().timestamp())
        doc_data = dict(msg_dict)
        doc_data['created_at'] = datetime.datetime.utcnow().isoformat() + "Z"
        client.collection('messages').document(mid).set(doc_data, merge=True)

        # Update conversation container
        conv_id = str(msg_dict.get('shipment_id') or msg_dict.get('conversation_id') or 'general')
        client.collection('conversations').document(conv_id).set({
            'shipment_id': msg_dict.get('shipment_id'),
            'last_message': msg_dict.get('message_text') or msg_dict.get('content'),
            'last_sender_id': msg_dict.get('sender_id'),
            'updated_at': datetime.datetime.utcnow().isoformat() + "Z"
        }, merge=True)
        return True
    except Exception as e:
        logger.warning(f"Failed to sync message to Firestore: {e}")
        return False

