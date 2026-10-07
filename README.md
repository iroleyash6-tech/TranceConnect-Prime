# TranceConnect-Pro

A professional cloud-ready transport connection platform for Dealers, Transporters and Admins.

## Included requirements
- Separate Dealer, Transporter and Admin dashboards
- Dealer selects a transporter for a shipment/cargo request
- Company name, mobile number, email and GST number during registration/profile setup
- Transporter verification: Aadhaar card and driving licence uploads
- Dealer documents: Invoice and Delivery Order (DO) uploads
- Vehicle documents: RC and Insurance
- Product type is configurable; transport is not limited to one product
- Live location center UI
- Real-time chat UI / messaging foundation
- AI Assistant UI
- WhatsApp communication buttons
- Forgot password + OTP reset flow foundation
- Animated vehicle hero section
- Mouse-follow/parallax background effect
- Responsive layout for mobile, tablet and laptop
- Backend API foundation
- MySQL schema
- Cloud deployment notes

## Run the frontend
Open `frontend/index.html` in a browser, or serve the folder with any static web server.

## Run the backend
Python 3.11+ recommended.

    cd backend
    python -m venv venv
    # Windows PowerShell:
    .\venv\Scripts\Activate.ps1
    pip install -r requirements.txt
    python app.py

The API starts on http://127.0.0.1:5000

## Database
Create a MySQL database and run `database/schema.sql`.

Set environment variables:
DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD

This package is a clean project foundation. Replace placeholder media in `assets/` with licensed vehicle photos/videos before production deployment.
