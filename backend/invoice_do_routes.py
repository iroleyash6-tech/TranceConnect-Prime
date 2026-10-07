import os
import sys
import uuid
import datetime
from flask import Blueprint, jsonify, request, send_file, abort

try:
    from backend.db import get_db_connection
    from backend.auth_util import token_required, role_required
    from backend.document_service import (
        number_to_words_inr, generate_document_qr, generate_invoice_pdf, generate_delivery_order_pdf
    )
except ImportError:
    from db import get_db_connection
    from auth_util import token_required, role_required
    from document_service import (
        number_to_words_inr, generate_document_qr, generate_invoice_pdf, generate_delivery_order_pdf
    )

invoice_do_bp = Blueprint('invoice_do', __name__)

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
UPLOAD_DIR = os.path.join(BASE_DIR, 'uploads', 'documents')


# ===================================================================
# NUMBER GENERATORS
# ===================================================================
def generate_unique_invoice_number(cur):
    year = datetime.date.today().year
    prefix = f"TC-INV-{year}-"
    cur.execute("SELECT invoice_number FROM invoices WHERE invoice_number LIKE %s ORDER BY id DESC LIMIT 1", (f"{prefix}%",))
    last = cur.fetchone()
    if last and last.get('invoice_number'):
        try:
            seq_part = last['invoice_number'].replace(prefix, "")
            seq = int(seq_part) + 1
        except Exception:
            seq = 1
    else:
        seq = 1
    return f"{prefix}{seq:06d}"

def generate_unique_do_number(cur):
    year = datetime.date.today().year
    prefix = f"TC-DO-{year}-"
    cur.execute("SELECT do_number FROM delivery_orders WHERE do_number LIKE %s ORDER BY id DESC LIMIT 1", (f"{prefix}%",))
    last = cur.fetchone()
    if last and last.get('do_number'):
        try:
            seq_part = last['do_number'].replace(prefix, "")
            seq = int(seq_part) + 1
        except Exception:
            seq = 1
    else:
        seq = 1
    return f"{prefix}{seq:06d}"

def log_audit(cur, doc_type, doc_id, doc_number, user_id, action, details=""):
    try:
        ip = request.remote_addr if request else '127.0.0.1'
        cur.execute("""
            INSERT INTO document_audit_logs (document_type, document_id, document_number, user_id, action, details, ip_address)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (doc_type, doc_id, doc_number, user_id, action, str(details), ip))
    except Exception as e:
        print(f"Warning: Audit log error: {e}")


# ===================================================================
# 1. INVOICE ENDPOINTS
# ===================================================================

@invoice_do_bp.get("/api/invoices")
@token_required
def list_invoices(current_user):
    """
    Lists invoices with filtering.
    Dealer sees own, Transporter sees assigned shipments, Admin sees all.
    """
    status = request.args.get('status')
    search = request.args.get('search', '').strip().lower()
    shipment_id = request.args.get('shipment_id')

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            query = """
                SELECT i.*, 
                       u_deal.company_name AS dealer_name,
                       u_trans.company_name AS transporter_name,
                       s.product_type AS shipment_product,
                       (SELECT COUNT(*) FROM invoice_items WHERE invoice_id = i.id) AS item_count
                FROM invoices i
                LEFT JOIN users u_deal ON i.dealer_id = u_deal.id
                LEFT JOIN users u_trans ON i.transporter_id = u_trans.id
                LEFT JOIN shipments s ON i.shipment_id = s.id
                WHERE 1=1
            """
            params = []

            # Role scoping
            if current_user['role'] == 'dealer':
                query += " AND i.dealer_id = %s"
                params.append(current_user['id'])
            elif current_user['role'] == 'transporter':
                query += " AND (i.transporter_id = %s OR i.shipment_id IN (SELECT id FROM shipments WHERE transporter_id = %s))"
                params.extend([current_user['id'], current_user['id']])

            if status:
                query += " AND i.status = %s"
                params.append(status)

            if shipment_id:
                query += " AND i.shipment_id = %s"
                params.append(shipment_id)

            if search:
                query += " AND (LOWER(i.invoice_number) LIKE %s OR LOWER(i.buyer_company) LIKE %s OR LOWER(i.buyer_name) LIKE %s)"
                term = f"%{search}%"
                params.extend([term, term, term])

            query += " ORDER BY i.id DESC"
            cur.execute(query, tuple(params))
            invoices = cur.fetchall()

            # Format dates and decimals
            for inv in invoices:
                if inv.get('invoice_date'): inv['invoice_date'] = str(inv['invoice_date'])
                if inv.get('due_date'): inv['due_date'] = str(inv['due_date'])
                if inv.get('created_at'): inv['created_at'] = inv['created_at'].isoformat()
                if inv.get('updated_at'): inv['updated_at'] = inv['updated_at'].isoformat()
                for num_col in ['subtotal', 'discount_amount', 'taxable_amount', 'cgst_amount', 'sgst_amount', 'igst_amount', 'total_amount']:
                    inv[num_col] = float(inv.get(num_col) or 0.0)

            return jsonify({"invoices": invoices, "total": len(invoices)}), 200
    finally:
        conn.close()


@invoice_do_bp.get("/api/invoices/<int:inv_id>")
@token_required
def get_invoice_detail(current_user, inv_id):
    """
    Fetches single invoice record with its line items.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT i.*, 
                       u_deal.company_name AS dealer_name,
                       u_trans.company_name AS transporter_name,
                       s.product_type AS shipment_product
                FROM invoices i
                LEFT JOIN users u_deal ON i.dealer_id = u_deal.id
                LEFT JOIN users u_trans ON i.transporter_id = u_trans.id
                LEFT JOIN shipments s ON i.shipment_id = s.id
                WHERE i.id = %s
            """, (inv_id,))
            inv = cur.fetchone()
            if not inv:
                return jsonify({"error": "Invoice not found"}), 404

            # Authorization Check
            if current_user['role'] == 'dealer' and inv['dealer_id'] != current_user['id']:
                return jsonify({"error": "Unauthorized access to this invoice"}), 403
            if current_user['role'] == 'transporter' and inv['transporter_id'] != current_user['id']:
                # Also allow if assigned on shipment
                cur.execute("SELECT id FROM shipments WHERE id = %s AND transporter_id = %s", (inv['shipment_id'], current_user['id']))
                if not cur.fetchone():
                    return jsonify({"error": "Unauthorized access to this invoice"}), 403

            # Fetch line items
            cur.execute("SELECT * FROM invoice_items WHERE invoice_id = %s ORDER BY id ASC", (inv_id,))
            items = cur.fetchall()

            if inv.get('invoice_date'): inv['invoice_date'] = str(inv['invoice_date'])
            if inv.get('due_date'): inv['due_date'] = str(inv['due_date'])
            if inv.get('created_at'): inv['created_at'] = inv['created_at'].isoformat()
            if inv.get('updated_at'): inv['updated_at'] = inv['updated_at'].isoformat()
            for num_col in ['subtotal', 'discount_amount', 'taxable_amount', 'cgst_amount', 'sgst_amount', 'igst_amount', 'total_amount']:
                inv[num_col] = float(inv.get(num_col) or 0.0)

            for it in items:
                for num_col in ['quantity', 'rate', 'discount', 'taxable_value', 'gst_rate', 'cgst_amount', 'sgst_amount', 'igst_amount', 'total']:
                    it[num_col] = float(it.get(num_col) or 0.0)

            inv['items'] = items
            return jsonify({"invoice": inv}), 200
    finally:
        conn.close()


@invoice_do_bp.post("/api/invoices")
@token_required
def create_invoice(current_user):
    """
    Creates a new professional Tax Invoice with items, auto-generates QR code and PDF.
    """
    if current_user['role'] not in ['dealer', 'admin']:
        return jsonify({"error": "Only Dealers and Administrators can generate Invoices"}), 403

    data = request.get_json(silent=True) or {}
    items = data.get('items') or []
    if not items:
        return jsonify({"error": "At least one product item is required to create an invoice"}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Auto-generate or sanitize invoice number
            inv_number = data.get('invoice_number', '').strip()
            if not inv_number:
                inv_number = generate_unique_invoice_number(cur)
            else:
                # Check uniqueness
                cur.execute("SELECT id FROM invoices WHERE invoice_number = %s", (inv_number,))
                if cur.fetchone():
                    inv_number = generate_unique_invoice_number(cur)

            dealer_id = current_user['id'] if current_user['role'] == 'dealer' else (data.get('dealer_id') or current_user['id'])
            shipment_id = data.get('shipment_id') or None
            transporter_id = data.get('transporter_id') or None
            vehicle_id = data.get('vehicle_id') or None
            vehicle_number = data.get('vehicle_number', '').strip() or None

            inv_date = data.get('invoice_date') or datetime.date.today().strftime('%Y-%m-%d')
            due_date = data.get('due_date') or None
            place_of_supply = data.get('place_of_supply', '').strip() or data.get('buyer_state', 'Maharashtra')
            payment_terms = data.get('payment_terms', 'Net 30 Days').strip()

            seller_company = data.get('seller_company', current_user.get('company_name', 'Shipper Co.')).strip()
            seller_address = data.get('seller_address', current_user.get('address', 'Commercial District')).strip()
            seller_mobile = data.get('seller_mobile', current_user.get('mobile', '')).strip()
            seller_email = data.get('seller_email', current_user.get('email', '')).strip()
            seller_gst = data.get('seller_gst', current_user.get('gst_number', '')).strip()
            seller_state = data.get('seller_state', current_user.get('state', 'Maharashtra')).strip()
            seller_state_code = data.get('seller_state_code', '27').strip()

            buyer_name = data.get('buyer_name', '').strip()
            buyer_company = data.get('buyer_company', '').strip()
            if not buyer_company:
                return jsonify({"error": "Buyer Company Name is required"}), 400

            buyer_address = data.get('buyer_address', '').strip()
            if not buyer_address:
                return jsonify({"error": "Buyer Billing Address is required"}), 400

            buyer_shipping_address = data.get('buyer_shipping_address', buyer_address).strip()
            buyer_mobile = data.get('buyer_mobile', '').strip()
            buyer_email = data.get('buyer_email', '').strip()
            buyer_gst = data.get('buyer_gst', '').strip()
            buyer_state = data.get('buyer_state', 'Maharashtra').strip()
            buyer_state_code = data.get('buyer_state_code', '27').strip()

            bank_name = data.get('bank_name', 'HDFC Bank Ltd - Corporate Banking').strip()
            bank_account_no = data.get('bank_account_no', '50200088991122').strip()
            bank_ifsc = data.get('bank_ifsc', 'HDFC0000123').strip()

            # Determine intra-state vs inter-state
            is_interstate = (seller_state.lower() != buyer_state.lower()) and bool(seller_state and buyer_state)

            # Calculate item financial lines
            calc_subtotal = 0.0
            calc_discount = 0.0
            calc_taxable = 0.0
            calc_cgst = 0.0
            calc_sgst = 0.0
            calc_igst = 0.0
            calc_total = 0.0

            processed_items = []
            for it in items:
                it_name = it.get('item_name', 'Freight / Commercial Cargo').strip()
                desc = it.get('description', '').strip()
                hsn = it.get('hsn_sac', '996511').strip()
                qty = float(it.get('quantity', 1.0))
                unit = it.get('unit', 'Tons').strip()
                rate = float(it.get('rate', 0.0))
                disc = float(it.get('discount', 0.0))

                line_sub = round(qty * rate, 2)
                line_taxable = round(max(0.0, line_sub - disc), 2)
                gst_pct = float(it.get('gst_rate', 18.0))

                if is_interstate:
                    line_igst = round(line_taxable * (gst_pct / 100.0), 2)
                    line_cgst = 0.0
                    line_sgst = 0.0
                else:
                    line_igst = 0.0
                    line_cgst = round(line_taxable * ((gst_pct / 2.0) / 100.0), 2)
                    line_sgst = round(line_taxable * ((gst_pct / 2.0) / 100.0), 2)

                line_tot = round(line_taxable + line_cgst + line_sgst + line_igst, 2)

                calc_subtotal += line_sub
                calc_discount += disc
                calc_taxable += line_taxable
                calc_cgst += line_cgst
                calc_sgst += line_sgst
                calc_igst += line_igst
                calc_total += line_tot

                processed_items.append({
                    'item_name': it_name,
                    'description': desc,
                    'hsn_sac': hsn,
                    'quantity': qty,
                    'unit': unit,
                    'rate': rate,
                    'discount': disc,
                    'taxable_value': line_taxable,
                    'gst_rate': gst_pct,
                    'cgst_amount': line_cgst,
                    'sgst_amount': line_sgst,
                    'igst_amount': line_igst,
                    'total': line_tot
                })

            grand_total = round(calc_total, 2)
            words = number_to_words_inr(grand_total)

            notes = data.get('notes', '').strip()
            terms = data.get('terms_conditions', '').strip()
            status = data.get('status', 'Finalized').strip()

            # Insert Invoice record
            cur.execute("""
                INSERT INTO invoices (
                    invoice_number, dealer_id, shipment_id, transporter_id, vehicle_id, vehicle_number,
                    invoice_date, due_date, place_of_supply, payment_terms,
                    seller_company, seller_address, seller_mobile, seller_email, seller_gst, seller_state, seller_state_code,
                    buyer_name, buyer_company, buyer_address, buyer_shipping_address, buyer_mobile, buyer_email, buyer_gst, buyer_state, buyer_state_code,
                    bank_name, bank_account_no, bank_ifsc,
                    subtotal, discount_amount, taxable_amount, cgst_amount, sgst_amount, igst_amount, total_amount, amount_in_words,
                    notes, terms_conditions, status
                ) VALUES (
                    %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s
                )
            """, (
                inv_number, dealer_id, shipment_id, transporter_id, vehicle_id, vehicle_number,
                inv_date, due_date, place_of_supply, payment_terms,
                seller_company, seller_address, seller_mobile, seller_email, seller_gst, seller_state, seller_state_code,
                buyer_name, buyer_company, buyer_address, buyer_shipping_address, buyer_mobile, buyer_email, buyer_gst, buyer_state, buyer_state_code,
                bank_name, bank_account_no, bank_ifsc,
                calc_subtotal, calc_discount, calc_taxable, calc_cgst, calc_sgst, calc_igst, grand_total, words,
                notes, terms, status
            ))
            inv_id = cur.lastrowid

            # Insert line items
            for it in processed_items:
                cur.execute("""
                    INSERT INTO invoice_items (
                        invoice_id, item_name, description, hsn_sac, quantity, unit, rate, discount,
                        taxable_value, gst_rate, cgst_amount, sgst_amount, igst_amount, total
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    inv_id, it['item_name'], it['description'], it['hsn_sac'], it['quantity'], it['unit'], it['rate'], it['discount'],
                    it['taxable_value'], it['gst_rate'], it['cgst_amount'], it['sgst_amount'], it['igst_amount'], it['total']
                ))

            # Generate QR Code & PDF File
            verify_url = f"{request.host_url.rstrip('/')}/verify/invoice/{inv_number}"
            qr_file = generate_document_qr(verify_url, inv_number)

            inv_dict = {
                'invoice_number': inv_number,
                'invoice_date': inv_date,
                'due_date': due_date or 'Upon Receipt',
                'place_of_supply': place_of_supply,
                'payment_terms': payment_terms,
                'seller_company': seller_company,
                'seller_address': seller_address,
                'seller_gst': seller_gst,
                'seller_mobile': seller_mobile,
                'seller_email': seller_email,
                'seller_state': seller_state,
                'seller_state_code': seller_state_code,
                'buyer_name': buyer_name,
                'buyer_company': buyer_company,
                'buyer_address': buyer_address,
                'buyer_gst': buyer_gst,
                'buyer_mobile': buyer_mobile,
                'buyer_state': buyer_state,
                'buyer_state_code': buyer_state_code,
                'shipment_id': shipment_id,
                'vehicle_number': vehicle_number or 'Assigned Freight Carrier',
                'bank_name': bank_name,
                'bank_account_no': bank_account_no,
                'bank_ifsc': bank_ifsc,
                'subtotal': calc_subtotal,
                'discount_amount': calc_discount,
                'taxable_amount': calc_taxable,
                'cgst_amount': calc_cgst,
                'sgst_amount': calc_sgst,
                'igst_amount': calc_igst,
                'total_amount': grand_total,
                'amount_in_words': words,
                'terms_conditions': terms
            }

            pdf_file = generate_invoice_pdf(inv_dict, processed_items, qr_file)
            rel_pdf = os.path.basename(pdf_file)
            rel_qr = os.path.basename(qr_file)

            cur.execute("UPDATE invoices SET pdf_path = %s, qr_code_path = %s WHERE id = %s", (rel_pdf, rel_qr, inv_id))

            # If connected to shipment, update shipment invoice link
            if shipment_id:
                cur.execute("UPDATE shipments SET invoice_document = %s WHERE id = %s", (rel_pdf, shipment_id))

            # Audit log
            log_audit(cur, 'invoice', inv_id, inv_number, current_user['id'], 'CREATE_INVOICE', f"Amount: ₹{grand_total:,.2f}")

        conn.commit()
        return jsonify({
            "message": f"Tax Invoice #{inv_number} created and saved successfully!",
            "invoice_id": inv_id,
            "invoice_number": inv_number,
            "total_amount": grand_total,
            "pdf_url": f"/api/invoices/{inv_id}/pdf",
            "verify_url": verify_url
        }), 201
    except Exception as e:
        conn.rollback()
        print(f"Create invoice error: {e}")
        return jsonify({"error": f"Failed to create invoice: {str(e)}"}), 500
    finally:
        conn.close()


@invoice_do_bp.put("/api/invoices/<int:inv_id>")
@token_required
def update_invoice(current_user, inv_id):
    """
    Updates an existing invoice (allowed if status is Draft or user is admin).
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM invoices WHERE id = %s", (inv_id,))
            inv = cur.fetchone()
            if not inv:
                return jsonify({"error": "Invoice not found"}), 404

            if current_user['role'] == 'dealer' and inv['dealer_id'] != current_user['id']:
                return jsonify({"error": "Unauthorized"}), 403

            if inv['status'] not in ['Draft'] and current_user['role'] != 'admin':
                return jsonify({"error": "Finalized or Paid invoices cannot be edited. Please duplicate or cancel."}), 400

            data = request.get_json(silent=True) or {}
            items = data.get('items') or []

            # Recompute totals if items passed
            if items:
                seller_state = data.get('seller_state', inv['seller_state'])
                buyer_state = data.get('buyer_state', inv['buyer_state'])
                is_interstate = (seller_state.lower() != buyer_state.lower()) and bool(seller_state and buyer_state)

                calc_subtotal = 0.0
                calc_discount = 0.0
                calc_taxable = 0.0
                calc_cgst = 0.0
                calc_sgst = 0.0
                calc_igst = 0.0
                calc_total = 0.0

                cur.execute("DELETE FROM invoice_items WHERE invoice_id = %s", (inv_id,))
                processed_items = []
                for it in items:
                    qty = float(it.get('quantity', 1.0))
                    rate = float(it.get('rate', 0.0))
                    disc = float(it.get('discount', 0.0))
                    line_sub = round(qty * rate, 2)
                    line_taxable = round(max(0.0, line_sub - disc), 2)
                    gst_pct = float(it.get('gst_rate', 18.0))

                    if is_interstate:
                        line_igst = round(line_taxable * (gst_pct / 100.0), 2)
                        line_cgst = line_sgst = 0.0
                    else:
                        line_igst = 0.0
                        line_cgst = round(line_taxable * ((gst_pct / 2.0) / 100.0), 2)
                        line_sgst = round(line_taxable * ((gst_pct / 2.0) / 100.0), 2)

                    line_tot = round(line_taxable + line_cgst + line_sgst + line_igst, 2)
                    calc_subtotal += line_sub
                    calc_discount += disc
                    calc_taxable += line_taxable
                    calc_cgst += line_cgst
                    calc_sgst += line_sgst
                    calc_igst += line_igst
                    calc_total += line_tot

                    processed_items.append({
                        'item_name': it.get('item_name', 'Cargo').strip(),
                        'description': it.get('description', '').strip(),
                        'hsn_sac': it.get('hsn_sac', '996511').strip(),
                        'quantity': qty,
                        'unit': it.get('unit', 'Tons').strip(),
                        'rate': rate,
                        'discount': disc,
                        'taxable_value': line_taxable,
                        'gst_rate': gst_pct,
                        'cgst_amount': line_cgst,
                        'sgst_amount': line_sgst,
                        'igst_amount': line_igst,
                        'total': line_tot
                    })

                    cur.execute("""
                        INSERT INTO invoice_items (
                            invoice_id, item_name, description, hsn_sac, quantity, unit, rate, discount,
                            taxable_value, gst_rate, cgst_amount, sgst_amount, igst_amount, total
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """, (
                        inv_id, it.get('item_name', 'Cargo'), it.get('description', ''), it.get('hsn_sac', '996511'),
                        qty, it.get('unit', 'Tons'), rate, disc, line_taxable, gst_pct, line_cgst, line_sgst, line_igst, line_tot
                    ))

                words = number_to_words_inr(calc_total)
                cur.execute("""
                    UPDATE invoices SET
                        buyer_name = %s, buyer_company = %s, buyer_address = %s, buyer_gst = %s, buyer_mobile = %s,
                        subtotal = %s, discount_amount = %s, taxable_amount = %s,
                        cgst_amount = %s, sgst_amount = %s, igst_amount = %s, total_amount = %s, amount_in_words = %s,
                        status = %s
                    WHERE id = %s
                """, (
                    data.get('buyer_name', inv['buyer_name']),
                    data.get('buyer_company', inv['buyer_company']),
                    data.get('buyer_address', inv['buyer_address']),
                    data.get('buyer_gst', inv['buyer_gst']),
                    data.get('buyer_mobile', inv['buyer_mobile']),
                    calc_subtotal, calc_discount, calc_taxable,
                    calc_cgst, calc_sgst, calc_igst, calc_total, words,
                    data.get('status', inv['status']),
                    inv_id
                ))

            log_audit(cur, 'invoice', inv_id, inv['invoice_number'], current_user['id'], 'UPDATE_INVOICE')
        conn.commit()
        return jsonify({"message": f"Invoice #{inv['invoice_number']} updated successfully"}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()


@invoice_do_bp.put("/api/invoices/<int:inv_id>/status")
@token_required
def update_invoice_status(current_user, inv_id):
    """
    Updates invoice status (Draft, Finalized, Sent, Paid, Cancelled).
    """
    data = request.get_json(silent=True) or {}
    new_status = data.get('status')
    if new_status not in ['Draft', 'Finalized', 'Sent', 'Paid', 'Cancelled']:
        return jsonify({"error": "Invalid status value"}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM invoices WHERE id = %s", (inv_id,))
            inv = cur.fetchone()
            if not inv:
                return jsonify({"error": "Invoice not found"}), 404

            if current_user['role'] == 'dealer' and inv['dealer_id'] != current_user['id']:
                return jsonify({"error": "Unauthorized"}), 403

            cur.execute("UPDATE invoices SET status = %s WHERE id = %s", (new_status, inv_id))
            log_audit(cur, 'invoice', inv_id, inv['invoice_number'], current_user['id'], f'STATUS_CHANGE_TO_{new_status.upper()}')
        conn.commit()
        return jsonify({"message": f"Invoice status changed to {new_status}"}), 200
    finally:
        conn.close()


@invoice_do_bp.post("/api/invoices/<int:inv_id>/duplicate")
@token_required
def duplicate_invoice(current_user, inv_id):
    """
    Duplicates an existing invoice into a fresh Draft with a new unique invoice number.
    """
    if current_user['role'] not in ['dealer', 'admin']:
        return jsonify({"error": "Unauthorized"}), 403

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM invoices WHERE id = %s", (inv_id,))
            orig = cur.fetchone()
            if not orig:
                return jsonify({"error": "Original invoice not found"}), 404

            if current_user['role'] == 'dealer' and orig['dealer_id'] != current_user['id']:
                return jsonify({"error": "Unauthorized"}), 403

            cur.execute("SELECT * FROM invoice_items WHERE invoice_id = %s", (inv_id,))
            orig_items = cur.fetchall()

            new_number = generate_unique_invoice_number(cur)
            today_str = datetime.date.today().strftime('%Y-%m-%d')

            cur.execute("""
                INSERT INTO invoices (
                    invoice_number, dealer_id, shipment_id, transporter_id, vehicle_id, vehicle_number,
                    invoice_date, due_date, place_of_supply, payment_terms,
                    seller_company, seller_address, seller_mobile, seller_email, seller_gst, seller_state, seller_state_code,
                    buyer_name, buyer_company, buyer_address, buyer_shipping_address, buyer_mobile, buyer_email, buyer_gst, buyer_state, buyer_state_code,
                    bank_name, bank_account_no, bank_ifsc,
                    subtotal, discount_amount, taxable_amount, cgst_amount, sgst_amount, igst_amount, total_amount, amount_in_words,
                    notes, terms_conditions, status
                ) VALUES (
                    %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, 'Draft'
                )
            """, (
                new_number, orig['dealer_id'], orig['shipment_id'], orig['transporter_id'], orig['vehicle_id'], orig['vehicle_number'],
                today_str, orig['due_date'], orig['place_of_supply'], orig['payment_terms'],
                orig['seller_company'], orig['seller_address'], orig['seller_mobile'], orig['seller_email'], orig['seller_gst'], orig['seller_state'], orig['seller_state_code'],
                orig['buyer_name'], orig['buyer_company'], orig['buyer_address'], orig['buyer_shipping_address'], orig['buyer_mobile'], orig['buyer_email'], orig['buyer_gst'], orig['buyer_state'], orig['buyer_state_code'],
                orig['bank_name'], orig['bank_account_no'], orig['bank_ifsc'],
                orig['subtotal'], orig['discount_amount'], orig['taxable_amount'], orig['cgst_amount'], orig['sgst_amount'], orig['igst_amount'], orig['total_amount'], orig['amount_in_words'],
                orig['notes'], orig['terms_conditions']
            ))
            new_id = cur.lastrowid

            for it in orig_items:
                cur.execute("""
                    INSERT INTO invoice_items (
                        invoice_id, item_name, description, hsn_sac, quantity, unit, rate, discount,
                        taxable_value, gst_rate, cgst_amount, sgst_amount, igst_amount, total
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    new_id, it['item_name'], it['description'], it['hsn_sac'], it['quantity'], it['unit'], it['rate'], it['discount'],
                    it['taxable_value'], it['gst_rate'], it['cgst_amount'], it['sgst_amount'], it['igst_amount'], it['total']
                ))

            log_audit(cur, 'invoice', new_id, new_number, current_user['id'], 'DUPLICATE_FROM_' + orig['invoice_number'])
        conn.commit()
        return jsonify({"message": f"Invoice duplicated as #{new_number} (Draft)", "new_invoice_id": new_id, "new_invoice_number": new_number}), 201
    finally:
        conn.close()


@invoice_do_bp.get("/api/invoices/<int:inv_id>/pdf")
@token_required
def download_invoice_pdf(current_user, inv_id):
    """
    Downloads or streams the vector A4 PDF for an invoice.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM invoices WHERE id = %s", (inv_id,))
            inv = cur.fetchone()
            if not inv:
                return jsonify({"error": "Invoice not found"}), 404

            # Authorization check
            if current_user['role'] == 'dealer' and inv['dealer_id'] != current_user['id']:
                return jsonify({"error": "Unauthorized"}), 403

            # Check if existing PDF file exists on disk
            pdf_path = None
            if inv.get('pdf_path'):
                candidate = os.path.join(UPLOAD_DIR, inv['pdf_path'])
                if os.path.exists(candidate):
                    pdf_path = candidate

            # If not yet generated, build dynamically on demand
            if not pdf_path:
                cur.execute("SELECT * FROM invoice_items WHERE invoice_id = %s", (inv_id,))
                items = cur.fetchall()
                qr_file = None
                if inv.get('qr_code_path'):
                    cand_qr = os.path.join(UPLOAD_DIR, 'qr', inv['qr_code_path'])
                    if os.path.exists(cand_qr):
                        qr_file = cand_qr

                inv_dict = {
                    'invoice_number': inv['invoice_number'],
                    'invoice_date': str(inv['invoice_date']),
                    'due_date': str(inv['due_date']) if inv['due_date'] else 'Upon Delivery',
                    'place_of_supply': inv.get('place_of_supply', 'Maharashtra'),
                    'payment_terms': inv.get('payment_terms', 'Net 30'),
                    'seller_company': inv['seller_company'],
                    'seller_address': inv['seller_address'],
                    'seller_gst': inv['seller_gst'],
                    'seller_mobile': inv['seller_mobile'],
                    'seller_email': inv['seller_email'],
                    'seller_state': inv['seller_state'],
                    'seller_state_code': inv['seller_state_code'],
                    'buyer_name': inv['buyer_name'],
                    'buyer_company': inv['buyer_company'],
                    'buyer_address': inv['buyer_address'],
                    'buyer_gst': inv['buyer_gst'],
                    'buyer_mobile': inv['buyer_mobile'],
                    'buyer_state': inv['buyer_state'],
                    'buyer_state_code': inv['buyer_state_code'],
                    'shipment_id': inv['shipment_id'],
                    'vehicle_number': inv['vehicle_number'] or 'Allocated Carrier',
                    'bank_name': inv['bank_name'],
                    'bank_account_no': inv['bank_account_no'],
                    'bank_ifsc': inv['bank_ifsc'],
                    'subtotal': float(inv['subtotal']),
                    'discount_amount': float(inv['discount_amount']),
                    'taxable_amount': float(inv['taxable_amount']),
                    'cgst_amount': float(inv['cgst_amount']),
                    'sgst_amount': float(inv['sgst_amount']),
                    'igst_amount': float(inv['igst_amount']),
                    'total_amount': float(inv['total_amount']),
                    'amount_in_words': inv['amount_in_words'],
                    'terms_conditions': inv['terms_conditions']
                }
                pdf_path = generate_invoice_pdf(inv_dict, items, qr_file)
                cur.execute("UPDATE invoices SET pdf_path = %s WHERE id = %s", (os.path.basename(pdf_path), inv_id))
                conn.commit()

            return send_file(
                pdf_path,
                mimetype='application/pdf',
                as_attachment=True,
                download_name=f"{inv['invoice_number']}.pdf"
            )
    finally:
        conn.close()


# ===================================================================
# 2. DELIVERY ORDER (DO) ENDPOINTS
# ===================================================================

@invoice_do_bp.get("/api/delivery-orders")
@token_required
def list_delivery_orders(current_user):
    """
    Lists delivery orders with role filtering.
    """
    status = request.args.get('status')
    search = request.args.get('search', '').strip().lower()
    shipment_id = request.args.get('shipment_id')

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            query = """
                SELECT d.*, 
                       u_deal.company_name AS dealer_name,
                       u_trans.company_name AS transporter_name_db,
                       s.product_type AS shipment_product,
                       (SELECT COUNT(*) FROM delivery_order_items WHERE do_id = d.id) AS item_count
                FROM delivery_orders d
                LEFT JOIN users u_deal ON d.dealer_id = u_deal.id
                LEFT JOIN users u_trans ON d.transporter_id = u_trans.id
                LEFT JOIN shipments s ON d.shipment_id = s.id
                WHERE 1=1
            """
            params = []

            if current_user['role'] == 'dealer':
                query += " AND d.dealer_id = %s"
                params.append(current_user['id'])
            elif current_user['role'] == 'transporter':
                query += " AND (d.transporter_id = %s OR d.shipment_id IN (SELECT id FROM shipments WHERE transporter_id = %s))"
                params.extend([current_user['id'], current_user['id']])

            if status:
                query += " AND d.status = %s"
                params.append(status)

            if shipment_id:
                query += " AND d.shipment_id = %s"
                params.append(shipment_id)

            if search:
                query += " AND (LOWER(d.do_number) LIKE %s OR LOWER(d.consignee_company) LIKE %s OR LOWER(d.vehicle_number) LIKE %s)"
                term = f"%{search}%"
                params.extend([term, term, term])

            query += " ORDER BY d.id DESC"
            cur.execute(query, tuple(params))
            dos = cur.fetchall()

            for item in dos:
                if item.get('do_date'): item['do_date'] = str(item['do_date'])
                if item.get('valid_until'): item['valid_until'] = str(item['valid_until'])
                if item.get('created_at'): item['created_at'] = item['created_at'].isoformat()
                if item.get('updated_at'): item['updated_at'] = item['updated_at'].isoformat()
                item['total_weight'] = float(item.get('total_weight') or 0.0)
                item['total_quantity'] = float(item.get('total_quantity') or 0.0)

            return jsonify({"delivery_orders": dos, "total": len(dos)}), 200
    finally:
        conn.close()


@invoice_do_bp.get("/api/delivery-orders/<int:do_id>")
@token_required
def get_delivery_order_detail(current_user, do_id):
    """
    Fetches full delivery order record with line items.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT d.*, 
                       u_deal.company_name AS dealer_name,
                       u_trans.company_name AS transporter_name_db,
                       s.product_type AS shipment_product
                FROM delivery_orders d
                LEFT JOIN users u_deal ON d.dealer_id = u_deal.id
                LEFT JOIN users u_trans ON d.transporter_id = u_trans.id
                LEFT JOIN shipments s ON d.shipment_id = s.id
                WHERE d.id = %s
            """, (do_id,))
            item = cur.fetchone()
            if not item:
                return jsonify({"error": "Delivery Order not found"}), 404

            # Authorization Check
            if current_user['role'] == 'dealer' and item['dealer_id'] != current_user['id']:
                return jsonify({"error": "Unauthorized"}), 403
            if current_user['role'] == 'transporter' and item['transporter_id'] != current_user['id']:
                cur.execute("SELECT id FROM shipments WHERE id = %s AND transporter_id = %s", (item['shipment_id'], current_user['id']))
                if not cur.fetchone():
                    return jsonify({"error": "Unauthorized"}), 403

            cur.execute("SELECT * FROM delivery_order_items WHERE do_id = %s ORDER BY sr_no ASC", (do_id,))
            lines = cur.fetchall()

            if item.get('do_date'): item['do_date'] = str(item['do_date'])
            if item.get('valid_until'): item['valid_until'] = str(item['valid_until'])
            if item.get('created_at'): item['created_at'] = item['created_at'].isoformat()
            if item.get('updated_at'): item['updated_at'] = item['updated_at'].isoformat()
            item['total_weight'] = float(item.get('total_weight') or 0.0)
            item['total_quantity'] = float(item.get('total_quantity') or 0.0)

            for l in lines:
                l['quantity'] = float(l.get('quantity') or 0.0)
                l['weight'] = float(l.get('weight') or 0.0)

            item['items'] = lines
            return jsonify({"delivery_order": item}), 200
    finally:
        conn.close()


@invoice_do_bp.post("/api/delivery-orders")
@token_required
def create_delivery_order(current_user):
    """
    Creates a new Delivery Order (DO) & Gate Pass with auto QR and vector PDF.
    """
    if current_user['role'] not in ['dealer', 'admin']:
        return jsonify({"error": "Only Dealers and Administrators can issue Delivery Orders"}), 403

    data = request.get_json(silent=True) or {}
    items = data.get('items') or []
    if not items:
        # Default single cargo row
        items = [{
            'sr_no': 1,
            'product_description': data.get('product_type', 'Commercial Freight Cargo'),
            'quantity': float(data.get('total_quantity', 1.0)),
            'unit': 'Tons',
            'weight': float(data.get('total_weight', 1.0)),
            'package_type': 'Standard Bundles / Pallets',
            'remarks': 'Secure industrial transport'
        }]

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            do_number = data.get('do_number', '').strip()
            if not do_number:
                do_number = generate_unique_do_number(cur)
            else:
                cur.execute("SELECT id FROM delivery_orders WHERE do_number = %s", (do_number,))
                if cur.fetchone():
                    do_number = generate_unique_do_number(cur)

            dealer_id = current_user['id'] if current_user['role'] == 'dealer' else (data.get('dealer_id') or current_user['id'])
            shipment_id = data.get('shipment_id') or None
            transporter_id = data.get('transporter_id') or None
            vehicle_id = data.get('vehicle_id') or None
            driver_id = data.get('driver_id') or None

            do_date = data.get('do_date') or datetime.date.today().strftime('%Y-%m-%d')
            valid_until = data.get('valid_until') or None

            consignor_company = data.get('consignor_company', current_user.get('company_name', 'Shipper Co.')).strip()
            consignor_address = data.get('consignor_address', current_user.get('address', 'Depot Hub')).strip()
            consignor_mobile = data.get('consignor_mobile', current_user.get('mobile', '')).strip()
            consignor_email = data.get('consignor_email', current_user.get('email', '')).strip()
            consignor_gst = data.get('consignor_gst', current_user.get('gst_number', '')).strip()

            consignee_company = data.get('consignee_company', '').strip()
            if not consignee_company:
                return jsonify({"error": "Consignee / Receiver Company Name is required"}), 400

            consignee_address = data.get('consignee_address', '').strip()
            if not consignee_address:
                return jsonify({"error": "Consignee Delivery Destination Address is required"}), 400

            consignee_contact = data.get('consignee_contact', 'Receiving Supervisor').strip()
            consignee_mobile = data.get('consignee_mobile', '').strip()
            consignee_gst = data.get('consignee_gst', '').strip()

            transporter_company = data.get('transporter_company', 'Apex Freight Carriers').strip()
            transporter_mobile = data.get('transporter_mobile', '').strip()
            transporter_gst = data.get('transporter_gst', '').strip()
            vehicle_number = data.get('vehicle_number', 'MH-04-AB-1234').strip()
            vehicle_type = data.get('vehicle_type', '32ft Multi-Axle Truck').strip()
            driver_name = data.get('driver_name', 'Commercial Driver').strip()
            driver_mobile = data.get('driver_mobile', '').strip()
            driver_license = data.get('driver_license', '').strip()

            pickup_location = data.get('pickup_location', 'Origin Depot').strip()
            delivery_location = data.get('delivery_location', consignee_address).strip()
            product_type = data.get('product_type', 'Commercial Goods').strip()
            transport_type = data.get('transport_type', 'Full Truck Load (FTL)').strip()

            # Sum item weights and quantities
            total_wt = sum(float(it.get('weight', 0.0)) for it in items)
            total_qty = sum(float(it.get('quantity', 0.0)) for it in items)

            delivery_instructions = data.get('delivery_instructions', 'Deliver within operational gate hours. Record inward weighbridge reading.').strip()
            handling_instructions = data.get('handling_instructions', 'Weatherproof tarp covering mandatory. Secure with industrial cargo lashings.').strip()
            pickup_instructions = data.get('pickup_instructions', '').strip()
            special_remarks = data.get('special_remarks', '').strip()
            authorized_signatory = data.get('authorized_signatory', current_user.get('contact_person', 'Logistics Officer')).strip()
            terms_conditions = data.get('terms_conditions', '').strip()
            status = data.get('status', 'Issued').strip()

            cur.execute("""
                INSERT INTO delivery_orders (
                    do_number, dealer_id, shipment_id, transporter_id, vehicle_id, driver_id,
                    do_date, valid_until,
                    consignor_company, consignor_address, consignor_mobile, consignor_email, consignor_gst,
                    consignee_company, consignee_address, consignee_contact, consignee_mobile, consignee_gst,
                    transporter_company, transporter_mobile, transporter_gst,
                    vehicle_number, vehicle_type, driver_name, driver_mobile, driver_license,
                    pickup_location, delivery_location, product_type, total_weight, total_quantity, transport_type,
                    delivery_instructions, handling_instructions, pickup_instructions, special_remarks,
                    authorized_signatory, terms_conditions, status
                ) VALUES (
                    %s, %s, %s, %s, %s, %s,
                    %s, %s,
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s
                )
            """, (
                do_number, dealer_id, shipment_id, transporter_id, vehicle_id, driver_id,
                do_date, valid_until,
                consignor_company, consignor_address, consignor_mobile, consignor_email, consignor_gst,
                consignee_company, consignee_address, consignee_contact, consignee_mobile, consignee_gst,
                transporter_company, transporter_mobile, transporter_gst,
                vehicle_number, vehicle_type, driver_name, driver_mobile, driver_license,
                pickup_location, delivery_location, product_type, total_wt, total_qty, transport_type,
                delivery_instructions, handling_instructions, pickup_instructions, special_remarks,
                authorized_signatory, terms_conditions, status
            ))
            do_id = cur.lastrowid

            # Insert line items
            for idx, it in enumerate(items, 1):
                cur.execute("""
                    INSERT INTO delivery_order_items (
                        do_id, sr_no, product_description, quantity, unit, weight, package_type, remarks
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    do_id, idx, it.get('product_description', product_type), float(it.get('quantity', 1.0)),
                    it.get('unit', 'Tons'), float(it.get('weight', 0.0)),
                    it.get('package_type', 'Standard Pallets'), it.get('remarks', '')
                ))

            # Generate QR Code & Vector PDF
            verify_url = f"{request.host_url.rstrip('/')}/verify/do/{do_number}"
            qr_file = generate_document_qr(verify_url, do_number)

            do_dict = {
                'do_number': do_number,
                'do_date': do_date,
                'valid_until': valid_until or '7 Days from Issue',
                'consignor_company': consignor_company,
                'consignor_address': consignor_address,
                'consignor_gst': consignor_gst,
                'consignor_mobile': consignor_mobile,
                'consignee_company': consignee_company,
                'consignee_address': consignee_address,
                'consignee_contact': consignee_contact,
                'consignee_mobile': consignee_mobile,
                'consignee_gst': consignee_gst,
                'transporter_company': transporter_company,
                'vehicle_number': vehicle_number,
                'vehicle_type': vehicle_type,
                'driver_name': driver_name,
                'driver_mobile': driver_mobile,
                'driver_license': driver_license,
                'pickup_location': pickup_location,
                'delivery_location': delivery_location,
                'delivery_instructions': delivery_instructions,
                'handling_instructions': handling_instructions
            }

            pdf_file = generate_delivery_order_pdf(do_dict, items, qr_file)
            rel_pdf = os.path.basename(pdf_file)
            rel_qr = os.path.basename(qr_file)

            cur.execute("UPDATE delivery_orders SET pdf_path = %s, qr_code_path = %s WHERE id = %s", (rel_pdf, rel_qr, do_id))

            if shipment_id:
                cur.execute("UPDATE shipments SET do_document = %s WHERE id = %s", (rel_pdf, shipment_id))

            log_audit(cur, 'delivery_order', do_id, do_number, current_user['id'], 'CREATE_DO', f"Weight: {total_wt}T")

        conn.commit()
        return jsonify({
            "message": f"Delivery Order #{do_number} issued and saved successfully!",
            "do_id": do_id,
            "do_number": do_number,
            "pdf_url": f"/api/delivery-orders/{do_id}/pdf",
            "verify_url": verify_url
        }), 201
    except Exception as e:
        conn.rollback()
        print(f"Create DO error: {e}")
        return jsonify({"error": f"Failed to issue Delivery Order: {str(e)}"}), 500
    finally:
        conn.close()


@invoice_do_bp.put("/api/delivery-orders/<int:do_id>/status")
@token_required
def update_delivery_order_status(current_user, do_id):
    """
    Updates DO status (Draft, Issued, Assigned, In Transit, Delivered, Cancelled).
    """
    data = request.get_json(silent=True) or {}
    new_status = data.get('status')
    if new_status not in ['Draft', 'Issued', 'Assigned', 'In Transit', 'Delivered', 'Cancelled']:
        return jsonify({"error": "Invalid status"}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM delivery_orders WHERE id = %s", (do_id,))
            item = cur.fetchone()
            if not item:
                return jsonify({"error": "DO not found"}), 404

            if current_user['role'] == 'dealer' and item['dealer_id'] != current_user['id']:
                return jsonify({"error": "Unauthorized"}), 403

            cur.execute("UPDATE delivery_orders SET status = %s WHERE id = %s", (new_status, do_id))
            log_audit(cur, 'delivery_order', do_id, item['do_number'], current_user['id'], f'STATUS_CHANGE_TO_{new_status.upper()}')
        conn.commit()
        return jsonify({"message": f"DO status changed to {new_status}"}), 200
    finally:
        conn.close()


@invoice_do_bp.get("/api/delivery-orders/<int:do_id>/pdf")
@token_required
def download_delivery_order_pdf(current_user, do_id):
    """
    Downloads or streams vector A4 PDF for Delivery Order.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM delivery_orders WHERE id = %s", (do_id,))
            item = cur.fetchone()
            if not item:
                return jsonify({"error": "Delivery Order not found"}), 404

            if current_user['role'] == 'dealer' and item['dealer_id'] != current_user['id']:
                return jsonify({"error": "Unauthorized"}), 403

            pdf_path = None
            if item.get('pdf_path'):
                candidate = os.path.join(UPLOAD_DIR, item['pdf_path'])
                if os.path.exists(candidate):
                    pdf_path = candidate

            if not pdf_path:
                cur.execute("SELECT * FROM delivery_order_items WHERE do_id = %s", (do_id,))
                items = cur.fetchall()
                qr_file = None
                if item.get('qr_code_path'):
                    cand_qr = os.path.join(UPLOAD_DIR, 'qr', item['qr_code_path'])
                    if os.path.exists(cand_qr):
                        qr_file = cand_qr

                do_dict = {
                    'do_number': item['do_number'],
                    'do_date': str(item['do_date']),
                    'valid_until': str(item['valid_until']) if item['valid_until'] else '7 Days from Issue',
                    'consignor_company': item['consignor_company'],
                    'consignor_address': item['consignor_address'],
                    'consignor_gst': item['consignor_gst'],
                    'consignor_mobile': item['consignor_mobile'],
                    'consignee_company': item['consignee_company'],
                    'consignee_address': item['consignee_address'],
                    'consignee_contact': item['consignee_contact'],
                    'consignee_mobile': item['consignee_mobile'],
                    'consignee_gst': item['consignee_gst'],
                    'transporter_company': item['transporter_company'],
                    'vehicle_number': item['vehicle_number'],
                    'vehicle_type': item['vehicle_type'],
                    'driver_name': item['driver_name'],
                    'driver_mobile': item['driver_mobile'],
                    'driver_license': item['driver_license'],
                    'pickup_location': item['pickup_location'],
                    'delivery_location': item['delivery_location'],
                    'delivery_instructions': item['delivery_instructions'],
                    'handling_instructions': item['handling_instructions']
                }
                pdf_path = generate_delivery_order_pdf(do_dict, items, qr_file)
                cur.execute("UPDATE delivery_orders SET pdf_path = %s WHERE id = %s", (os.path.basename(pdf_path), do_id))
                conn.commit()

            return send_file(
                pdf_path,
                mimetype='application/pdf',
                as_attachment=True,
                download_name=f"{item['do_number']}.pdf"
            )
    finally:
        conn.close()


# ===================================================================
# 3. CONTEXT & PRE-FILL ENDPOINT (SHIPMENT INTEGRATION)
# ===================================================================

@invoice_do_bp.get("/api/shipments/<int:shipment_id>/document-context")
@token_required
def get_shipment_document_context(current_user, shipment_id):
    """
    Returns pre-populated fields for Invoice Maker & DO Maker directly from the shipment.
    Avoids duplicate typing.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT s.*, 
                       u_deal.company_name AS dealer_company,
                       u_deal.address AS dealer_address,
                       u_deal.mobile AS dealer_mobile,
                       u_deal.email AS dealer_email,
                       u_deal.gst_number AS dealer_gst,
                       u_deal.state AS dealer_state,
                       u_deal.city AS dealer_city,
                       u_trans.company_name AS transporter_company,
                       u_trans.mobile AS transporter_mobile,
                       u_trans.email AS transporter_email,
                       u_trans.gst_number AS transporter_gst,
                       v.vehicle_number,
                       v.vehicle_type,
                       d.name AS driver_name,
                       d.mobile AS driver_mobile,
                       d.license_number AS driver_license
                FROM shipments s
                JOIN users u_deal ON s.dealer_id = u_deal.id
                LEFT JOIN users u_trans ON s.transporter_id = u_trans.id
                LEFT JOIN vehicles v ON s.vehicle_id = v.id
                LEFT JOIN drivers d ON s.driver_id = d.id
                WHERE s.id = %s
            """, (shipment_id,))
            ship = cur.fetchone()
            if not ship:
                return jsonify({"error": "Shipment not found"}), 404

            # Authorization Check
            if current_user['role'] == 'dealer' and ship['dealer_id'] != current_user['id']:
                return jsonify({"error": "Unauthorized"}), 403
            if current_user['role'] == 'transporter' and ship['transporter_id'] != current_user['id']:
                return jsonify({"error": "Unauthorized"}), 403

            # Check if invoice or DO already created
            cur.execute("SELECT id, invoice_number, status, total_amount FROM invoices WHERE shipment_id = %s LIMIT 1", (shipment_id,))
            linked_inv = cur.fetchone()

            cur.execute("SELECT id, do_number, status FROM delivery_orders WHERE shipment_id = %s LIMIT 1", (shipment_id,))
            linked_do = cur.fetchone()

            # Pre-populate suggested DO and Invoice numbers
            next_inv_num = generate_unique_invoice_number(cur)
            next_do_num = generate_unique_do_number(cur)

            ctx = {
                "shipment": {
                    "id": ship['id'],
                    "product_type": ship['product_type'],
                    "transport_type": ship['transport_type'],
                    "weight_tons": float(ship['weight_tons']),
                    "price_per_trip": float(ship['price_per_trip']),
                    "pickup_location": ship['pickup_location'],
                    "delivery_location": ship['delivery_location'],
                    "status": ship['status'],
                    "notes": ship['notes']
                },
                "seller": {
                    "company_name": ship['dealer_company'],
                    "address": ship['dealer_address'] or f"Industrial Hub, {ship['dealer_city'] or 'Mumbai'}",
                    "mobile": ship['dealer_mobile'],
                    "email": ship['dealer_email'],
                    "gst_number": ship['dealer_gst'] or '27AAACB2345M1ZV',
                    "state": ship['dealer_state'] or 'Maharashtra',
                    "state_code": "27"
                },
                "buyer_suggestion": {
                    "company_name": f"{ship['delivery_location'].split(',')[0]} Commercial Yard",
                    "address": ship['delivery_location'],
                    "state": ship['dealer_state'] or 'Maharashtra',
                    "state_code": "27"
                },
                "transporter": {
                    "company_name": ship['transporter_company'] or 'Apex Freight Carriers',
                    "mobile": ship['transporter_mobile'] or '',
                    "email": ship['transporter_email'] or '',
                    "gst_number": ship['transporter_gst'] or ''
                },
                "vehicle": {
                    "number": ship['vehicle_number'] or ship['vehicle_required'],
                    "type": ship['vehicle_type'] or ship['vehicle_required']
                },
                "driver": {
                    "name": ship['driver_name'] or 'Commercial Highway Driver',
                    "mobile": ship['driver_mobile'] or '',
                    "license": ship['driver_license'] or ''
                },
                "suggested_invoice_number": next_inv_num,
                "suggested_do_number": next_do_num,
                "linked_invoice": linked_inv,
                "linked_delivery_order": linked_do
            }
            return jsonify(ctx), 200
    finally:
        conn.close()


# ===================================================================
# 4. PUBLIC DOCUMENT VERIFICATION (QR CODE TARGETS)
# ===================================================================

@invoice_do_bp.get("/api/verify/invoice/<string:inv_number>")
def public_verify_invoice(inv_number):
    """
    Public verification endpoint for Invoice QR codes.
    Returns authenticity details without leaking private bank accounts or contact numbers.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT invoice_number, invoice_date, seller_company, buyer_company, 
                       total_amount, status, created_at
                FROM invoices 
                WHERE invoice_number = %s
            """, (inv_number,))
            inv = cur.fetchone()
            if not inv:
                return jsonify({
                    "verified": False,
                    "message": "Invalid or unverified document reference. Not found in TranceConnect registry."
                }), 404

            return jsonify({
                "verified": True,
                "document_type": "Tax Invoice",
                "invoice_number": inv['invoice_number'],
                "invoice_date": str(inv['invoice_date']),
                "seller_company": inv['seller_company'],
                "buyer_company": inv['buyer_company'],
                "total_amount": float(inv['total_amount']),
                "status": inv['status'],
                "certified_network": "TranceConnect-Prime Cryptographic Transit Vault",
                "verified_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
            }), 200
    finally:
        conn.close()


@invoice_do_bp.get("/api/verify/do/<string:do_number>")
def public_verify_do(do_number):
    """
    Public verification endpoint for Delivery Order QR codes.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT do_number, do_date, consignor_company, consignee_company, 
                       vehicle_number, product_type, total_weight, status, created_at
                FROM delivery_orders 
                WHERE do_number = %s
            """, (do_number,))
            do = cur.fetchone()
            if not do:
                return jsonify({
                    "verified": False,
                    "message": "Invalid or unverified Delivery Order reference."
                }), 404

            return jsonify({
                "verified": True,
                "document_type": "Delivery Order & Dispatch Pass",
                "do_number": do['do_number'],
                "do_date": str(do['do_date']),
                "consignor_company": do['consignor_company'],
                "consignee_company": do['consignee_company'],
                "vehicle_number": do['vehicle_number'],
                "product_type": do['product_type'],
                "total_weight": float(do['total_weight']),
                "status": do['status'],
                "certified_network": "TranceConnect-Prime Cryptographic Transit Vault",
                "verified_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
            }), 200
    finally:
        conn.close()
