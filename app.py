import os
import sys

# Configure UTF-8 encoding for stdout on Windows terminals
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

# Ensure backend and root are in sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(BASE_DIR, 'backend')
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from backend.app import app, socketio

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    print("==================================================")
    print("TranceConnect-Prime Production Real-Time Server Starting")
    print(f"Access Web Application at: http://127.0.0.1:{port}")
    print("==================================================")
    socketio.run(app, host="0.0.0.0", port=port, debug=False, allow_unsafe_werkzeug=True)
