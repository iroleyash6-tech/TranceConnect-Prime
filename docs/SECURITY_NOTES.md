# TranceConnect-Prime Security Architecture & Hardening Notes

This document summarizes security measures implemented across TranceConnect-Prime to protect corporate logistics data, financial records, and operational telemetry.

---

## 1. Authentication & Session Management

- **Cryptographic Password Storage**: Passwords are never stored in plaintext. Passwords are salted and hashed using `werkzeug.security.generate_password_hash` with `pbkdf2:sha256` iterations.
- **Signed JWT Tokens**: Stateless user authentication relies on signed HMAC-SHA256 tokens carrying user role, user ID, expiration timestamp (`exp`), and issued-at timestamp (`iat`).
- **Role-Based Access Control (RBAC)**: All protected API routes verify token claims through the `@token_required` decorator. Dealer, transporter, and administrator roles cannot escalate permissions or execute endpoints outside their scope.
- **OTP Verification Security**:
  - One-time passwords are strictly 6 numeric digits generated using secure random sources.
  - Rate-limited generation with a 60-second cooldown timer.
  - Automatic expiration after 300 seconds (5 minutes).
  - Max retry attempt counter prevents brute-forcing.

---

## 2. Database Protection & SQL Injection Prevention

- **Parameterized Queries**: 100% of SQL queries use parameterized queries (`%s` placeholders with bound tuple parameters), preventing SQL injection attacks across both MySQL and SQLite adapters.
- **Resilient Circuit-Breaker**: The database layer features automatic fallback detection and error isolation to avoid exposing database connection strings or stack traces in API responses.
- **No Committed Credentials**: `.gitignore` strictly protects `.env`, SQLite database files, and uploaded corporate tax documents from being committed to Git.

---

## 3. Document Generation & Verification Integrity

- **Encrypted Tamper-Proof QR Codes**: Tax Invoices and Delivery Orders embed SHA-256 digital verification hashes. Scanning the QR code points to the public `/api/verify/invoice/<number>` endpoint, ensuring physical paper gate passes cannot be forged.
- **File Upload Restrictions**: File extensions are restricted to safe types (`pdf`, `png`, `jpg`, `jpeg`, `webp`), and content length is capped at 16 MB.

---

## 4. Emergency Secret Rotation Procedure

If a secret key or database credential is ever compromised:
1. Immediately generate a new cryptographic key:
   ```bash
   python -c "import secrets; print(secrets.token_hex(32))"
   ```
2. Update the environment variables in your deployment host:
   - `SECRET_KEY`
   - `JWT_SECRET`
   - `MYSQL_PASSWORD`
3. Restart backend instances. All existing active sessions will be safely invalidated, requiring re-authentication with new JWT signatures.
