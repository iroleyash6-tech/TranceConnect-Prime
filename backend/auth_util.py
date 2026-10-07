import os
import datetime
import jwt
from functools import wraps
from flask import request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

SECRET_KEY = os.getenv('JWT_SECRET') or os.getenv('SECRET_KEY', 'tranceconnect-prime-jwt-secret-key-2026')

def hash_password(password: str) -> str:
    """Hashes a plaintext password securely."""
    return generate_password_hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plaintext password against a stored hash."""
    return check_password_hash(hashed_password, plain_password)

def create_access_token(user_id: int, role: str, email: str, days: int = 7) -> str:
    """Generates a signed JWT access token."""
    payload = {
        'user_id': user_id,
        'role': role,
        'email': email,
        'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=days),
        'iat': datetime.datetime.now(datetime.timezone.utc)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm='HS256')

def decode_access_token(token: str) -> dict:
    """Decodes a JWT token. Raises exceptions on invalid or expired token."""
    return jwt.decode(token, SECRET_KEY, algorithms=['HS256'])

def token_required(f):
    """
    Decorator to protect routes requiring authentication.
    Passes current_user dict (user_id, role, email) to the wrapped function.
    Supports Authorization Bearer header or token query parameter.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization')
        if auth_header:
            parts = auth_header.split()
            if len(parts) == 2 and parts[0].lower() == 'bearer':
                token = parts[1]
        
        # Fallback to query param (e.g. for direct file downloads)
        if not token:
            token = request.args.get('token')

        if not token:
            return jsonify({'error': 'Authentication token is missing. Please log in.'}), 401

        try:
            payload = decode_access_token(token)
            current_user = {
                'id': payload['user_id'],
                'role': payload['role'],
                'email': payload['email']
            }
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token has expired. Please log in again.'}), 401
        except Exception as e:
            return jsonify({'error': 'Invalid authentication token: ' + str(e)}), 401

        return f(current_user, *args, **kwargs)
    return decorated

def role_required(*allowed_roles):
    """
    Decorator to enforce role-based access control.
    Example: @role_required('admin', 'transporter')
    Must be placed after @token_required.
    """
    def decorator(f):
        @wraps(f)
        def decorated(current_user, *args, **kwargs):
            if current_user.get('role') not in allowed_roles:
                return jsonify({
                    'error': f"Access forbidden: requires one of {allowed_roles} roles. Your role is '{current_user.get('role')}'."
                }), 403
            return f(current_user, *args, **kwargs)
        return decorated
    return decorator
