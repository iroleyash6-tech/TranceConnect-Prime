"""
TRANCECONNECT-PRO: AUTOMATED TEST SUITE FOR FIREBASE STORAGE & DOCUMENT VAULT
Validates storage configuration, authorization, validation, least-privilege security,
failure handling, and QR verification privacy for project transconnect-2fb2b.
"""

import io
import os
import uuid
import pytest
from unittest.mock import patch, MagicMock

from backend.storage_service import (
    validate_file, generate_storage_path, get_storage_diagnostic,
    check_document_access, delete_stored_file, MAX_FILE_SIZE_BYTES
)
from backend.db import get_db_connection


def test_storage_status_endpoint(client):
    """Verifies that /api/storage/status returns valid JSON with correct project and bucket."""
    res = client.get('/api/storage/status')
    assert res.status_code == 200, res.get_json()
    data = res.get_json()
    assert data['project_id'] == 'transconnect-2fb2b'
    assert 'transconnect-2fb2b' in data['configured_bucket']
    assert data['max_size_mb'] == 16
    assert 'pdf' in data['allowed_extensions']
    assert 'provider' in data


def test_health_endpoint_includes_storage(client):
    """Verifies that /api/health includes the storage subsystem status."""
    res = client.get('/api/health')
    assert res.status_code == 200
    data = res.get_json()
    assert 'storage' in data
    assert data['storage']['project_id'] == 'transconnect-2fb2b'


def test_storage_diagnostic_graceful_missing_storage():
    """Confirms diagnostic gracefully reports console action when storage is uninitialized."""
    diag = get_storage_diagnostic()
    assert diag['project_id'] == 'transconnect-2fb2b'
    assert 'https://console.firebase.google.com/project/transconnect-2fb2b/storage' in diag['console_setup_url']
    if not diag['storage_ready']:
        assert diag['provider'] == 'local_secure_vault'
        assert diag['action_required'] is not None


def test_unauthorized_upload_rejected_without_token(client):
    """Confirms unauthenticated users cannot upload documents."""
    data = {'file': (io.BytesIO(b"dummy pdf content"), 'test.pdf')}
    res = client.post('/api/documents/upload', data=data, content_type='multipart/form-data')
    assert res.status_code == 401


def test_unauthorized_download_rejected_without_token(client):
    """Confirms unauthenticated users cannot download documents."""
    res = client.get('/api/documents/1/download')
    assert res.status_code == 401


def test_authorized_dealer_upload_valid_pdf(client, dealer_token):
    """Tests that an authorized dealer can upload a valid commercial PDF."""
    pdf_content = b"%PDF-1.4\n1 0 obj\n<< /Title (Test Document) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF"
    data = {
        'file': (io.BytesIO(pdf_content), 'commercial_contract.pdf'),
        'document_type': 'invoice'
    }
    res = client.post(
        '/api/documents/upload',
        data=data,
        content_type='multipart/form-data',
        headers={'Authorization': f'Bearer {dealer_token}'}
    )
    assert res.status_code == 201, res.get_json()
    body = res.get_json()
    assert 'document_id' in body
    assert body['file_name'] == 'commercial_contract.pdf'
    assert body['document_type'] == 'invoice'
    assert 'download_url' in body


def test_authorized_transporter_upload_valid_image(client, transporter_token):
    """Tests that an authorized transporter can upload a valid KYC image."""
    png_header = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
    data = {
        'file': (io.BytesIO(png_header), 'aadhaar_card.png'),
        'document_type': 'aadhaar'
    }
    res = client.post(
        '/api/documents/upload',
        data=data,
        content_type='multipart/form-data',
        headers={'Authorization': f'Bearer {transporter_token}'}
    )
    assert res.status_code == 201, res.get_json()
    body = res.get_json()
    assert body['document_type'] == 'aadhaar'
    assert 'document_id' in body


def test_invalid_file_extension_rejected(client, dealer_token):
    """Tests that non-permitted file extensions (e.g. .exe, .sh) are rejected with HTTP 400."""
    script_content = b"echo 'Malicious Payload'"
    data = {
        'file': (io.BytesIO(script_content), 'exploit.sh'),
        'document_type': 'other'
    }
    res = client.post(
        '/api/documents/upload',
        data=data,
        content_type='multipart/form-data',
        headers={'Authorization': f'Bearer {dealer_token}'}
    )
    assert res.status_code == 400
    assert 'not permitted' in res.get_json()['error'].lower() or 'not allowed' in res.get_json()['error'].lower()


def test_oversized_file_rejected_by_validator():
    """Tests that files exceeding 16 MB are rejected by the validator."""
    mock_file = MagicMock()
    mock_file.filename = "large_dump.pdf"
    mock_file.content_type = "application/pdf"
    mock_file.tell.return_value = 17 * 1024 * 1024  # 17 MB

    is_valid, err = validate_file(mock_file, 'invoice')
    assert not is_valid
    assert '16 mb' in err.lower()


def test_empty_file_rejected():
    """Tests that empty (0-byte) files are rejected."""
    mock_file = MagicMock()
    mock_file.filename = "empty.pdf"
    mock_file.content_type = "application/pdf"
    mock_file.tell.return_value = 0

    is_valid, err = validate_file(mock_file, 'invoice')
    assert not is_valid
    assert 'empty' in err.lower()


def test_document_ownership_isolation(client, dealer_token, transporter_token):
    """
    Tests least-privilege security:
    A dealer cannot download a private KYC document uploaded by a transporter.
    """
    # 1. Transporter uploads private KYC doc
    png_content = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
    data = {
        'file': (io.BytesIO(png_content), 'secret_driver_license.png'),
        'document_type': 'driving_license'
    }
    up_res = client.post(
        '/api/documents/upload',
        data=data,
        content_type='multipart/form-data',
        headers={'Authorization': f'Bearer {transporter_token}'}
    )
    assert up_res.status_code == 201
    doc_id = up_res.get_json()['document_id']

    # 2. Transporter can download their own document
    owner_res = client.get(
        f'/api/documents/{doc_id}/download',
        headers={'Authorization': f'Bearer {transporter_token}'}
    )
    assert owner_res.status_code == 200

    # 3. Dealer attempting to download Transporter's document gets 403 Forbidden
    unauthorized_res = client.get(
        f'/api/documents/{doc_id}/download',
        headers={'Authorization': f'Bearer {dealer_token}'}
    )
    assert unauthorized_res.status_code == 403
    assert 'forbidden' in unauthorized_res.get_json()['error'].lower()


def test_admin_can_access_all_documents(client, admin_token, transporter_token):
    """Confirms system administrator has audit read access to any document."""
    png_content = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
    data = {
        'file': (io.BytesIO(png_content), 'admin_audit_test.png'),
        'document_type': 'other'
    }
    up_res = client.post(
        '/api/documents/upload',
        data=data,
        content_type='multipart/form-data',
        headers={'Authorization': f'Bearer {transporter_token}'}
    )
    assert up_res.status_code == 201
    doc_id = up_res.get_json()['document_id']

    admin_res = client.get(
        f'/api/documents/{doc_id}/download',
        headers={'Authorization': f'Bearer {admin_token}'}
    )
    assert admin_res.status_code == 200


def test_failed_db_write_cleans_up_orphaned_file(client, dealer_token):
    """
    Confirms that if database insertion raises an exception during upload,
    the orphaned stored file is cleaned up via delete_stored_file.
    """
    pdf_content = b"%PDF-1.4\nTest Orphan Cleanup\n%%EOF"
    data = {
        'file': (io.BytesIO(pdf_content), 'orphan_test.pdf'),
        'document_type': 'invoice'
    }

    with patch('backend.app.get_db_connection') as mock_conn:
        mock_conn.side_effect = Exception("Simulated Database Failure")
        with patch('backend.app.delete_stored_file') as mock_delete:
            res = client.post(
                '/api/documents/upload',
                data=data,
                content_type='multipart/form-data',
                headers={'Authorization': f'Bearer {dealer_token}'}
            )
            assert res.status_code == 500
            assert mock_delete.called


def test_public_qr_verification_privacy(client):
    """
    Verifies that public QR verification reveals only high-level authenticity details
    and does NOT expose sensitive banking credentials, passwords, or raw file paths.
    """
    # Fetch an existing invoice number or create one
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT invoice_number FROM invoices LIMIT 1")
            row = cur.fetchone()
    finally:
        conn.close()

    if row:
        inv_num = row['invoice_number']
        res = client.get(f'/api/verify/invoice/{inv_num}')
        assert res.status_code == 200
        data = res.get_json()
        assert data['verified'] is True
        assert data['document_type'] == 'Tax Invoice'
        assert 'invoice_number' in data
        assert 'seller_company' in data
        assert 'buyer_company' in data
        # Ensure sensitive data is not leaked
        assert 'bank_account' not in data
        assert 'file_path' not in data
        assert 'pdf_path' not in data
