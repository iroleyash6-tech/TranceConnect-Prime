# TranceConnect-Prime Production Deployment Guide

This guide details recommended deployment architectures for deploying TranceConnect-Prime to production cloud environments.

---

## 1. Architecture Overview

```text
┌─────────────────────────┐          ┌──────────────────────────────────┐
│      Vercel / CDN       │          │      Cloud Application Host      │
│  (Static Web & 3D WebGL)│          │  (Render / AWS / DigitalOcean)   │
│                         │          │                                  │
│  - index.html           │ ──API──> │  - Flask WSGI / ASGI Application │
│  - dealer.html          │          │  - Flask-SocketIO Event Server   │
│  - transporter.html     │          │  - AI Logistics Heuristic Engine │
│  - vehicle-3d.js        │          │  - ReportLab PDF Compiler        │
└─────────────────────────┘          └──────────────────────────────────┘
                                                       │
                                                       ▼
                                     ┌──────────────────────────────────┐
                                     │        Managed Database          │
                                     │     (AWS RDS / PlanetScale)      │
                                     │                                  │
                                     │  - MySQL 8.0 Engine              │
                                     │  - TLS Connection Encryption     │
                                     │  - Automated Hourly Snapshots    │
                                     └──────────────────────────────────┘
```

---

## 2. Frontend Deployment (Vercel)

The frontend is fully static and configured for Vercel deployment:
1. Connect your GitHub repository to Vercel.
2. Set Root Directory: `./frontend` or use root with `vercel.json` rewrites.
3. In `vercel.json`, ensure API routes proxy to your live backend domain:
```json
{
  "version": 2,
  "rewrites": [
    { "source": "/api/(.*)", "destination": "https://api.yourdomain.com/api/$1" },
    { "source": "/socket.io/(.*)", "destination": "https://api.yourdomain.com/socket.io/$1" }
  ]
}
```

---

## 3. Backend Deployment (Render / AWS EC2 / DigitalOcean)

### Gunicorn + Eventlet Production Execution
Since the application uses `Flask-SocketIO` for real-time chat and GPS tracking, use `eventlet` or `gevent` worker classes with Gunicorn:

```bash
gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:$PORT backend.app:app
```

### Environment Configuration Checklist
Set the following environment variables on your cloud provider:
- `FLASK_ENV=production`
- `PORT=5000`
- `SECRET_KEY=<generate-crypto-random-64-char-string>`
- `JWT_SECRET=<generate-crypto-random-64-char-string>`
- `DB_TYPE=mysql`
- `MYSQL_HOST=<managed-db-endpoint>`
- `MYSQL_PORT=3306`
- `MYSQL_USER=<db-app-user>`
- `MYSQL_PASSWORD=<strong-db-password>`
- `MYSQL_DATABASE=tranceconnect_prod`
- `UPLOAD_FOLDER=/var/data/uploads`

---

## 4. Database Initialization on Production

Execute the database schema and initial live data seeds:
```bash
mysql -h <MYSQL_HOST> -u <MYSQL_USER> -p tranceconnect_prod < database/schema.sql
python database/seed_live_data.py
```

---

## 5. SSL / TLS and WebSocket Best Practices

- Terminate SSL at Cloudflare or AWS ALB.
- Enable HTTP/2 and WebSocket protocol upgrades (`Upgrade: websocket`).
- Configure CORS origins in `backend/app.py` or `.env` to restrict cross-origin access to your verified frontend domain.
