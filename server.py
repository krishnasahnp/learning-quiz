import http.server
import socketserver
import json
import os
from datetime import datetime

PORT = 8000
JSON_FILE = 'backend/reflections.json'

class JournalHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/api/entries':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                new_entry = json.loads(post_data.decode('utf-8'))
                
                # Add timestamp if not present
                if 'timestamp' not in new_entry:
                    new_entry['timestamp'] = datetime.now().isoformat()
                
                # Read existing entries
                if os.path.exists(JSON_FILE):
                    with open(JSON_FILE, 'r') as f:
                        try:
                            entries = json.load(f)
                        except json.JSONDecodeError:
                            entries = []
                else:
                    entries = []
                
                # Append new entry
                entries.append(new_entry)
                
                # Save back to file
                with open(JSON_FILE, 'w') as f:
                    json.dump(entries, f, indent=4)
                
                # Send response
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                response = {'status': 'success', 'message': 'Entry saved successfully'}
                self.wfile.write(json.dumps(response).encode('utf-8'))
                
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                response = {'status': 'error', 'message': str(e)}
                self.wfile.write(json.dumps(response).encode('utf-8'))
        else:
            self.send_error(404, "File not found")

print(f"Serving at http://localhost:{PORT}")
with socketserver.TCPServer(("", PORT), JournalHandler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
