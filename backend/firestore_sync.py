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
