# TranceConnect-Prime Developer Setup Guide

Welcome to **TranceConnect-Prime**, the next-generation intelligent logistics management platform connecting dealers, transporters, and deliveries.

---

## 1. Prerequisites

Ensure your development workstation has:
- **Python**: Version 3.10+ (`python --version`)
- **Git**: Version 2.30+ (`git --version`)
- **Node.js & npm** (optional for static asset testing): Version 18+ (`node -v`)
- **Database Engine**:
  - **SQLite (Zero-Config Test Mode)**: Built-in with Python, activated automatically when MySQL is unavailable or `DB_TYPE=sqlite` is specified.
  - **MySQL 8.0+ (Production Mode)**: Recommended for staging and production deployments.

---

## 2. Windows Quickstart

### Step 1: Clone or Navigate to the Repository
```powershell
cd %USERPROFILE%\Documents\TranceConnect-Prime
```

### Step 2: Create and Activate Python Virtual Environment
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

### Step 3: Install Required Dependencies
```powershell
pip install -r backend/requirements.txt
```

### Step 4: Configure Environment Variables
Copy `.env.example` to `.env`:
```powershell
Copy-Item .env.example .env
```
Ensure key variables are configured:
```ini
FLASK_ENV=development
PORT=5000
SECRET_KEY=generate-a-secure-random-key-here
JWT_SECRET=generate-a-secure-jwt-key-here
DB_TYPE=sqlite # or mysql
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=tranceconnect
```

### Step 5: Initialize and Seed Database
Run the seed script to create initial schema, fleet vehicles, demo dealers, and transporters:
```powershell
python database/seed_live_data.py
```

### Step 6: Launch Development Server
```powershell
python backend/app.py
```
Open your browser at:
`http://localhost:5000`

---

## 3. Seeded Demo Accounts

| Role | Email | Password | Access / Scope |
|---|---|---|---|
| **System Admin** | `admin@tranceconnect.com` | `Admin@123456` | Platform administration, user approvals, global telemetry |
| **Dealer** | `dealer@tranceconnect.com` | `Pass@123456` | Shipment posting, tax invoice issuing, delivery orders |
| **Transporter** | `transporter@tranceconnect.com` | `Pass@123456` | Fleet bidding, live GPS radar, vehicle & driver assignment |

---

## 4. Running the Automated Test Suite

TranceConnect-Prime includes 36 automated unit, integration, and security tests.

To run the complete test suite:
```powershell
pytest tests/ -v
```

To run with coverage reporting:
```powershell
pytest --cov=backend tests/
```
Target coverage: **100% test pass rate with zero errors**.
