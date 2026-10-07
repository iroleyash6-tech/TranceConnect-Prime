import sys
import os

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Ensure backend can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from backend.db import get_db_connection

def upgrade_schema():
    print("Executing TranceConnect-Prime Schema Upgrade for Invoice & Delivery Order Management...")
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # 1. Invoices Table
            cur.execute("""
            CREATE TABLE IF NOT EXISTS invoices (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                invoice_number VARCHAR(60) NOT NULL UNIQUE,
                dealer_id BIGINT NOT NULL,
                shipment_id BIGINT NULL,
                transporter_id BIGINT NULL,
                vehicle_id BIGINT NULL,
                vehicle_number VARCHAR(50) NULL,
                invoice_date DATE NOT NULL,
                due_date DATE NULL,
                place_of_supply VARCHAR(100) NULL,
                payment_terms VARCHAR(100) NULL,
                
                seller_company VARCHAR(180) NOT NULL,
                seller_address TEXT NULL,
                seller_mobile VARCHAR(30) NULL,
                seller_email VARCHAR(180) NULL,
                seller_gst VARCHAR(40) NULL,
                seller_state VARCHAR(100) NULL,
                seller_state_code VARCHAR(10) NULL,
                
                buyer_name VARCHAR(120) NULL,
                buyer_company VARCHAR(180) NOT NULL,
                buyer_address TEXT NOT NULL,
                buyer_shipping_address TEXT NULL,
                buyer_mobile VARCHAR(30) NULL,
                buyer_email VARCHAR(180) NULL,
                buyer_gst VARCHAR(40) NULL,
                buyer_state VARCHAR(100) NULL,
                buyer_state_code VARCHAR(10) NULL,
                
                bank_name VARCHAR(120) NULL,
                bank_account_no VARCHAR(60) NULL,
                bank_ifsc VARCHAR(30) NULL,
                
                subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                taxable_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                cgst_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                sgst_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                igst_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                amount_in_words VARCHAR(255) NULL,
                
                notes TEXT NULL,
                terms_conditions TEXT NULL,
                status ENUM('Draft', 'Finalized', 'Sent', 'Paid', 'Cancelled') NOT NULL DEFAULT 'Draft',
                pdf_path VARCHAR(500) NULL,
                qr_code_path VARCHAR(500) NULL,
                
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                
                INDEX idx_inv_dealer (dealer_id),
                INDEX idx_inv_shipment (shipment_id),
                INDEX idx_inv_status (status),
                FOREIGN KEY (dealer_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE SET NULL,
                FOREIGN KEY (transporter_id) REFERENCES users(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """)
            print("✓ invoices table ready")

            # 2. Invoice Items Table
            cur.execute("""
            CREATE TABLE IF NOT EXISTS invoice_items (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                invoice_id BIGINT NOT NULL,
                item_name VARCHAR(200) NOT NULL,
                description TEXT NULL,
                hsn_sac VARCHAR(30) NULL,
                quantity DECIMAL(10,2) NOT NULL DEFAULT 1.00,
                unit VARCHAR(30) NOT NULL DEFAULT 'Tons',
                rate DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                discount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                taxable_value DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                gst_rate DECIMAL(5,2) NOT NULL DEFAULT 18.00,
                cgst_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                sgst_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                igst_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                INDEX idx_item_inv (invoice_id),
                FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """)
            print("✓ invoice_items table ready")

            # 3. Delivery Orders Table
            cur.execute("""
            CREATE TABLE IF NOT EXISTS delivery_orders (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                do_number VARCHAR(60) NOT NULL UNIQUE,
                dealer_id BIGINT NOT NULL,
                shipment_id BIGINT NULL,
                transporter_id BIGINT NULL,
                vehicle_id BIGINT NULL,
                driver_id BIGINT NULL,
                do_date DATE NOT NULL,
                valid_until DATE NULL,
                
                consignor_company VARCHAR(180) NOT NULL,
                consignor_address TEXT NULL,
                consignor_mobile VARCHAR(30) NULL,
                consignor_email VARCHAR(180) NULL,
                consignor_gst VARCHAR(40) NULL,
                
                consignee_company VARCHAR(180) NOT NULL,
                consignee_address TEXT NOT NULL,
                consignee_contact VARCHAR(120) NULL,
                consignee_mobile VARCHAR(30) NULL,
                consignee_gst VARCHAR(40) NULL,
                
                transporter_company VARCHAR(180) NULL,
                transporter_mobile VARCHAR(30) NULL,
                transporter_gst VARCHAR(40) NULL,
                vehicle_number VARCHAR(50) NULL,
                vehicle_type VARCHAR(100) NULL,
                driver_name VARCHAR(120) NULL,
                driver_mobile VARCHAR(30) NULL,
                driver_license VARCHAR(60) NULL,
                
                pickup_location VARCHAR(255) NOT NULL,
                delivery_location VARCHAR(255) NOT NULL,
                product_type VARCHAR(150) NOT NULL,
                total_weight DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                total_quantity DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                transport_type VARCHAR(100) NULL,
                
                delivery_instructions TEXT NULL,
                handling_instructions TEXT NULL,
                pickup_instructions TEXT NULL,
                special_remarks TEXT NULL,
                authorized_signatory VARCHAR(120) NULL,
                terms_conditions TEXT NULL,
                
                status ENUM('Draft', 'Issued', 'Assigned', 'In Transit', 'Delivered', 'Cancelled') NOT NULL DEFAULT 'Draft',
                pdf_path VARCHAR(500) NULL,
                qr_code_path VARCHAR(500) NULL,
                
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                
                INDEX idx_do_dealer (dealer_id),
                INDEX idx_do_shipment (shipment_id),
                INDEX idx_do_status (status),
                FOREIGN KEY (dealer_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE SET NULL,
                FOREIGN KEY (transporter_id) REFERENCES users(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """)
            print("✓ delivery_orders table ready")

            # 4. Delivery Order Items Table
            cur.execute("""
            CREATE TABLE IF NOT EXISTS delivery_order_items (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                do_id BIGINT NOT NULL,
                sr_no INT NOT NULL DEFAULT 1,
                product_description VARCHAR(255) NOT NULL,
                quantity DECIMAL(10,2) NOT NULL DEFAULT 1.00,
                unit VARCHAR(30) NOT NULL DEFAULT 'Tons',
                weight DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                package_type VARCHAR(100) NULL DEFAULT 'Pallet / Standard',
                remarks TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                INDEX idx_item_do (do_id),
                FOREIGN KEY (do_id) REFERENCES delivery_orders(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """)
            print("✓ delivery_order_items table ready")

            # 5. Document Audit Logs Table
            cur.execute("""
            CREATE TABLE IF NOT EXISTS document_audit_logs (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                document_type ENUM('invoice', 'delivery_order') NOT NULL,
                document_id BIGINT NOT NULL,
                document_number VARCHAR(60) NOT NULL,
                user_id BIGINT NOT NULL,
                action VARCHAR(60) NOT NULL,
                details TEXT NULL,
                ip_address VARCHAR(60) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                INDEX idx_audit_doc (document_type, document_id),
                INDEX idx_audit_user (user_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """)
            print("✓ document_audit_logs table ready")

        conn.commit()
        print("★ All TranceConnect-Prime Document Tables Successfully Migrated!")
    except Exception as e:
        conn.rollback()
        print(f"Error during migration: {e}")
        raise e
    finally:
        conn.close()

if __name__ == '__main__':
    upgrade_schema()

