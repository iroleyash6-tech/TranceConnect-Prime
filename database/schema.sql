-- TranceConnect-Prime Database Schema
-- Production-ready schema for Dealers, Transporters, Admins, Vehicles, Drivers, Shipments, Documents, Tracking & Chat

CREATE DATABASE IF NOT EXISTS transconnectlinkx;
USE transconnectlinkx;

-- 1. Users Table (Dealers, Transporters, Admins)
CREATE TABLE IF NOT EXISTS users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    role ENUM('dealer', 'transporter', 'admin') NOT NULL,
    company_name VARCHAR(180) NOT NULL,
    contact_person VARCHAR(120) NULL,
    mobile VARCHAR(30) NOT NULL,
    email VARCHAR(180) NOT NULL UNIQUE,
    gst_number VARCHAR(40) NULL,
    password_hash VARCHAR(255) NOT NULL,
    address TEXT NULL,
    city VARCHAR(100) NULL,
    state VARCHAR(100) NULL,
    verification_status ENUM('pending', 'verified', 'rejected') DEFAULT 'pending',
    status ENUM('active', 'inactive', 'blocked') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_role (role),
    INDEX idx_user_email (email),
    INDEX idx_user_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Password Resets / OTP Table
CREATE TABLE IF NOT EXISTS password_resets (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(180) NOT NULL,
    otp_code VARCHAR(10) NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_reset_email_otp (email, otp_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Vehicles Table
CREATE TABLE IF NOT EXISTS vehicles (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    transporter_id BIGINT NOT NULL,
    vehicle_number VARCHAR(40) NOT NULL UNIQUE,
    vehicle_type VARCHAR(100) NOT NULL,
    capacity_tons DECIMAL(10,2) NOT NULL,
    rc_document VARCHAR(500) NULL,
    insurance_document VARCHAR(500) NULL,
    current_location VARCHAR(255) NULL,
    status ENUM('available', 'assigned', 'in_transit', 'maintenance') DEFAULT 'available',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (transporter_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_vehicle_transporter (transporter_id),
    INDEX idx_vehicle_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Drivers Table
CREATE TABLE IF NOT EXISTS drivers (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    transporter_id BIGINT NOT NULL,
    vehicle_id BIGINT NULL,
    name VARCHAR(120) NOT NULL,
    mobile VARCHAR(30) NOT NULL,
    license_number VARCHAR(60) NOT NULL,
    aadhaar_number VARCHAR(30) NULL,
    license_document VARCHAR(500) NULL,
    aadhaar_document VARCHAR(500) NULL,
    status ENUM('available', 'assigned', 'off_duty') DEFAULT 'available',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (transporter_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
    INDEX idx_driver_transporter (transporter_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Shipments Table
CREATE TABLE IF NOT EXISTS shipments (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    dealer_id BIGINT NOT NULL,
    transporter_id BIGINT NULL,
    vehicle_id BIGINT NULL,
    driver_id BIGINT NULL,
    product_type VARCHAR(150) NOT NULL,
    transport_type VARCHAR(150) NOT NULL,
    weight_tons DECIMAL(10,2) NOT NULL,
    vehicle_required VARCHAR(120) NOT NULL,
    pickup_location VARCHAR(255) NOT NULL,
    delivery_location VARCHAR(255) NOT NULL,
    pickup_date DATE NULL,
    expected_delivery_date DATE NULL,
    price_per_trip DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    invoice_document VARCHAR(500) NULL,
    do_document VARCHAR(500) NULL,
    status ENUM('Pending', 'Assigned', 'Accepted', 'In Transit', 'Delivered', 'Cancelled') DEFAULT 'Pending',
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (dealer_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (transporter_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
    FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL,
    INDEX idx_shipment_dealer (dealer_id),
    INDEX idx_shipment_transporter (transporter_id),
    INDEX idx_shipment_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Documents Table
CREATE TABLE IF NOT EXISTS documents (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    shipment_id BIGINT NULL,
    vehicle_id BIGINT NULL,
    driver_id BIGINT NULL,
    document_type ENUM('aadhaar', 'driving_license', 'invoice', 'delivery_order', 'rc', 'insurance', 'other') NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT NULL,
    mime_type VARCHAR(100) NULL,
    verification_status ENUM('pending', 'verified', 'rejected') DEFAULT 'pending',
    rejection_reason VARCHAR(255) NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE SET NULL,
    INDEX idx_doc_user (user_id),
    INDEX idx_doc_shipment (shipment_id),
    INDEX idx_doc_type (document_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Messages Table (Dealer <-> Transporter chat)
CREATE TABLE IF NOT EXISTS messages (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    shipment_id BIGINT NOT NULL,
    sender_id BIGINT NOT NULL,
    receiver_id BIGINT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_msg_shipment (shipment_id),
    INDEX idx_msg_receiver (receiver_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    title VARCHAR(180) NOT NULL,
    message TEXT NOT NULL,
    link VARCHAR(255) NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_notif_user (user_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Live Tracking Records Table
CREATE TABLE IF NOT EXISTS tracking_records (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    shipment_id BIGINT NOT NULL,
    vehicle_id BIGINT NULL,
    latitude DECIMAL(10,6) NOT NULL,
    longitude DECIMAL(10,6) NOT NULL,
    location_name VARCHAR(255) NOT NULL,
    speed_kmh DECIMAL(6,2) DEFAULT 0.00,
    status_note VARCHAR(255) NULL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
    INDEX idx_track_shipment (shipment_id, recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed Default Admin Account (admin@tranceconnect.com / Admin@123456)
INSERT INTO users (id, role, company_name, contact_person, mobile, email, gst_number, password_hash, verification_status, status)
VALUES (1, 'admin', 'TranceConnect HQ', 'System Admin', '9876543210', 'admin@tranceconnect.com', '27AAAAA0000A1Z5', 'scrypt:32768:8:1$OyD6SqkizBjzHS1C$952e08e077934259702724126c157669ca8c0e9051d3e360b623abe23809b24afaf3543d82a0fcab1d18768bca4998d229293a38613790b6ea461c69435113b2', 'verified', 'active')
ON DUPLICATE KEY UPDATE role='admin';

-- Seed Sample Transporter (transporter@tranceconnect.com / Pass@123456)
INSERT INTO users (id, role, company_name, contact_person, mobile, email, gst_number, password_hash, city, state, verification_status, status)
VALUES (2, 'transporter', 'Apex Logistics & Freight Corp', 'Rajesh Sharma', '9822011223', 'transporter@tranceconnect.com', '27AABCT1234F1Z8', 'scrypt:32768:8:1$m28DSVo9SposHESi$481544ab17ad4acaec5e3ac78641f422301db87ef3ad2269770a6300e399b470a88d3531d116c3d86bdd3c13346f77ffc3268ea87740660d9b8cdc0a678bbbe3', 'Mumbai', 'Maharashtra', 'verified', 'active')
ON DUPLICATE KEY UPDATE company_name=VALUES(company_name);

-- Seed Sample Transporter 2 (speedfreight@tranceconnect.com / Pass@123456)
INSERT INTO users (id, role, company_name, contact_person, mobile, email, gst_number, password_hash, city, state, verification_status, status)
VALUES (3, 'transporter', 'SpeedRoad Express Carriers', 'Amit Patil', '9890123456', 'speedfreight@tranceconnect.com', '27AABCS5678G1Z2', 'scrypt:32768:8:1$m28DSVo9SposHESi$481544ab17ad4acaec5e3ac78641f422301db87ef3ad2269770a6300e399b470a88d3531d116c3d86bdd3c13346f77ffc3268ea87740660d9b8cdc0a678bbbe3', 'Pune', 'Maharashtra', 'verified', 'active')
ON DUPLICATE KEY UPDATE company_name=VALUES(company_name);

-- Seed Sample Dealer (dealer@tranceconnect.com / Pass@123456)
INSERT INTO users (id, role, company_name, contact_person, mobile, email, gst_number, password_hash, city, state, verification_status, status)
VALUES (4, 'dealer', 'Bharat Steel & Infrastructure Ltd', 'Vikram Mehta', '9819876543', 'dealer@tranceconnect.com', '27AAACB2345M1ZV', 'scrypt:32768:8:1$m28DSVo9SposHESi$481544ab17ad4acaec5e3ac78641f422301db87ef3ad2269770a6300e399b470a88d3531d116c3d86bdd3c13346f77ffc3268ea87740660d9b8cdc0a678bbbe3', 'Navi Mumbai', 'Maharashtra', 'verified', 'active')
ON DUPLICATE KEY UPDATE company_name=VALUES(company_name);

-- Seed Sample Fleet Vehicles
INSERT INTO vehicles (id, transporter_id, vehicle_number, vehicle_type, capacity_tons, status, current_location)
VALUES 
(1, 2, 'MH-04-AB-1234', '32ft Multi-Axle Truck', 25.00, 'available', 'Bhiwandi, Maharashtra'),
(2, 2, 'MH-04-CD-5678', '20ft Container Truck', 15.00, 'available', 'JNPT Port, Navi Mumbai'),
(3, 3, 'MH-12-EF-9012', '14ft Open Body', 8.50, 'available', 'Chakan Industrial Hub, Pune')
ON DUPLICATE KEY UPDATE vehicle_number=VALUES(vehicle_number);

-- Seed Sample Drivers
INSERT INTO drivers (id, transporter_id, vehicle_id, name, mobile, license_number, aadhaar_number, status)
VALUES 
(1, 2, 1, 'Ramesh Yadav', '9870011223', 'MH0420180012345', '123456789012', 'available'),
(2, 2, 2, 'Suresh Kadam', '9870011224', 'MH0420190054321', '234567890123', 'available'),
(3, 3, 3, 'Ganesh Pawar', '9870011225', 'MH1220200098765', '345678901234', 'available')
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- 10. Invoices Table
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

-- 11. Invoice Items Table
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

-- 12. Delivery Orders Table
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

-- 13. Delivery Order Items Table
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

-- 14. Document Audit Logs Table
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
