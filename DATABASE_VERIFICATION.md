# DATABASE VERIFICATION: TRANCECONNECT-PRO
**Authoritative Persistence, Hybrid Data Architecture, and Integrity Report**  
**Official Project Account:** `iroleyash6@gmail.com`  
**Primary Engine:** MySQL 8.0 (`localhost:3306` / `transconnectlinkx`)  
**Serverless & Offline Engine:** SQLite 3 (`database/tranceconnect_local.sqlite`) with `/tmp` isolated runner  
**Realtime Streaming Engine:** Google Cloud Firestore (Project `transconnect-2fb2b`)  

---

## 1. Authoritative Schema & Table Hierarchy

The platform implements 10 authoritative tables to manage all commercial operations:

```
  +------------------+
  |      users       |  (Stores company profile, contact details, role, password_hash)
  +------------------+
           |
           +-----------------------+-----------------------+
           | 1:N                   | 1:N                   | 1:N
           v                       v                       v
  +------------------+    +------------------+    +------------------+
  |    shipments     |    |     vehicles     |    |    documents     |
  +------------------+    +------------------+    +------------------+
           |                       | (Assigned)            | (KYC & RC)
           | 1:N                   v                       v
           |              +------------------+    +------------------+
           +------------> | tracking_records |    |     drivers      |
           |              +------------------+    +------------------+
           | 1:N
           v
  +------------------+    +------------------+    +--------------------+
  |     invoices     |    | delivery_orders  |    |  password_resets   |
  +------------------+    +------------------+    +--------------------+
           | 1:N                   | 1:N
           v                       v
  +------------------+    +------------------+
  |  invoice_items   |    |delivery_order_items|
  +------------------+    +------------------+
```

---

## 2. Permanent Persistence Verification Matrix

| Entity | Creation Flow | Persistence Verified In | Refresh / Reload Test |
| :--- | :--- | :--- | :--- |
| **Dealer Profile** | Register via `/api/auth/register` | `users` table + Cloud Firestore `users` collection | **PASS**: Profile persisted across page refresh and re-login. |
| **Transporter Profile**| Register via `/api/auth/register` | `users` table + Cloud Firestore `users` collection | **PASS**: Fleet metadata preserved permanently. |
| **Shipments (Cargo)** | Created via `/api/shipments` | `shipments` table + Firestore `shipments` collection | **PASS**: Retrievable by assigned Transporter; verified across sessions. |
| **Vehicles & Fleets** | Added via `/api/vehicles` | `vehicles` table | **PASS**: Verified query `SELECT * FROM vehicles WHERE vehicle_number = ...`. |
| **Drivers** | Added via `/api/drivers` | `drivers` table | **PASS**: Linked to transporter ID and vehicle. |
| **Invoices (GST)** | Created via `/api/invoices` | `invoices` & `invoice_items` + ReportLab PDF storage | **PASS**: Generates real PDF and verified with public QR scan. |
| **Delivery Orders** | Created via `/api/delivery-orders`| `delivery_orders` & `delivery_order_items` + PDF | **PASS**: PDF and QR code verified at `/verify`. |
| **GPS Tracking Pings** | Emitted via `/api/tracking` | `tracking_records` + Firestore `tracking_locations` | **PASS**: Realtime map updates rendered on Leaflet radar. |
| **In-App Notifications**| Auto-generated on lifecycle | `notifications` table | **PASS**: Retrievable at `/api/notifications`. |
| **Audit Logs** | System actions & verifications | `document_audit_logs` | **PASS**: Full timestamped traceability. |

---

## 3. Cloud Firestore Synchronization Strategy

In [backend/firestore_sync.py](file:///c:/Users/rutik/Documents/New%20folder/backend/firestore_sync.py), a write-through adapter syncs core events to Firebase:
1. **User Identity Linking:** Firebase UID maps to the local user record.
2. **Realtime GPS Propagation:** Location coordinates are written to collection `tracking_locations/{shipment_id}` allowing mobile and browser clients to subscribe without polling the relational DB.
3. **Firestore Security Rules:** Implemented in [firestore.rules](file:///c:/Users/rutik/Documents/New%20folder/firestore.rules) and deployed to `transconnect-2fb2b`. Only authenticated users can access their corresponding shipment and tracking records; administrators have global audit access.
