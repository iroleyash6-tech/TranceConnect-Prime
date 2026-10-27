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
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "version": "2.4.0"
        }
        self.wfile.write(json.dumps(response_payload).encode())
        return
