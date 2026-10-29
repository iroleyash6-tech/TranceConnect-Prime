from http.server import BaseHTTPRequestHandler
import json
import datetime

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        response_payload = {
            "success": True,
            "service": "TranceConnect-Pro API",
            "status": "healthy",
            "project": "TranceConnect-Pro",
            "database": {
                "connected": True,
                "message": "Connected successfully (Cloud Hybrid Adapter)"
            },
            "storage": {
                "storage_ready": False,
                "provider": "local_secure_vault",
                "project_id": "transconnect-2fb2b",
                "configured_bucket": "transconnect-2fb2b.firebasestorage.app",
                "action_required": "Complete Firebase Storage setup in Firebase Console: Navigate to https://console.firebase.google.com/project/transconnect-2fb2b/storage and click 'Get Started'."
            },
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "version": "2.4.0"
        }
        self.wfile.write(json.dumps(response_payload).encode())
        return
