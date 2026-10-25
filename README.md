# TranceConnect-Prime

> **Connecting Dealers, Transporters & Deliveries Through Intelligent Logistics**

[![CI Test Suite](https://github.com/iroleyash6-tech/TranceConnect-Prime/actions/workflows/ci.yml/badge.svg)](https://github.com/iroleyash6-tech/TranceConnect-Prime/actions)
[![Python Version](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://www.python.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Tests Passing](https://img.shields.io/badge/tests-36%2F36%20passed-brightgreen.svg)](tests/)

TranceConnect-Prime is an enterprise-grade logistics and freight management platform powered by Python Flask, Three.js 3D WebGL graphics, Socket.IO real-time telemetry, and an automated ReportLab document compilation engine.

---

## ⚡ Key Highlights

- **Interactive 3D WebGL Vehicle Experience**: Real-time rendering of the *HyperHauler X-1* Anti-Gravity Freight Vehicle using Three.js with PBR materials, custom thrusters, interactive orbit, and low-spec fallback.
- **Enterprise Multi-Role Architecture**: Dedicated, secure workflows for **Dealers**, **Transporters**, and **HQ Administrators**.
- **Automated Tax Documents & QR Verification**: Instant generation of GST-compliant Tax Invoices and Delivery Orders with cryptographic QR codes and ReportLab vector A4 PDF export.
- **Real-Time Telemetry & Chat**: Socket.IO room-isolated communication with typing indicators, delivery receipts, and live GPS map tracking via Leaflet.
- **Built-in AI Logistics Specialist**: Intelligent heuristic advice for vehicle sizing (LCV to Multi-Axle Trailers), Indian E-Way bill regulations, and freight rate calculations.
- **Resilient Dual-Engine Database Adapter**: Native support for **MySQL 8.0+** in production with an automatic zero-config **SQLite engine** for instant local testing and CI pipelines.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Python 3.10+
- Git

### 2. Installation
```powershell
# Clone the repository
git clone https://github.com/iroleyash6-tech/TranceConnect-Prime.git
cd TranceConnect-Prime

# Create virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r backend/requirements.txt
```

### 3. Initialize Database & Seed Demo Accounts
```powershell
python database/seed_live_data.py
```

### 4. Run Development Server
```powershell
python backend/app.py
```
Open your browser at `http://localhost:5000`.

---

## 👥 Seeded Demo Credentials

| Role | Email | Password | Access Details |
|---|---|---|---|
| **System Admin** | `admin@tranceconnect.com` | `Admin@123456` | Platform-wide verification and system telemetry |
| **Dealer** | `dealer@tranceconnect.com` | `Pass@123456` | Post shipments, issue invoices and delivery orders |
| **Transporter** | `transporter@tranceconnect.com` | `Pass@123456` | Fleet management, bid acceptance, live driver tracking |

---

## 🧪 Automated Testing

TranceConnect-Prime includes a comprehensive 36-test automated suite covering authentication, RBAC, shipment workflows, fleet management, PDF generation, and Socket.IO real-time channels:

```powershell
pytest tests/ -v
```

All 36 tests execute cleanly in under 6 seconds with zero failures.

---

## 📚 Documentation

- [Setup Guide](docs/SETUP_GUIDE.md)
- [Deployment Guide](docs/DEPLOYMENT_GUIDE.md)
- [Security Architecture & Hardening Notes](docs/SECURITY_NOTES.md)
- [Project Audit Report](docs/PROJECT_AUDIT.md)
- [Project Status & Matrix](PROJECT_STATUS.md)

---

## 🛡️ License

TranceConnect-Prime is proprietary enterprise software. Licensed under the MIT License.
