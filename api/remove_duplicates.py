"""POST /api/remove_duplicates — Remove duplicate rows or a specific creator.
Body (optional): {"name": "exact name to delete"}
No body: removes all duplicate rows, keeping first occurrence.
"""
from http.server import BaseHTTPRequestHandler
from api._shared import _get_gsheet, json_response, read_body


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            body = read_body(self)
            sh = _get_gsheet()
            if sh is None:
                json_response(self, 500, {"error": "Could not connect to Google Sheets"})
                return

            all_values = sh.get_all_values()
            if len(all_values) < 2:
                json_response(self, 200, {"ok": True, "removed": 0})
                return

            target_name = (body.get("name") or "").strip()

            if target_name:
                # Delete a specific creator by exact name
                rows_to_delete = []
                for i, row in enumerate(all_values[1:], start=2):
                    if (row[0] or "").strip() == target_name:
                        rows_to_delete.append(i)
                removed = 0
                for row_num in sorted(rows_to_delete, reverse=True):
                    try:
                        sh.delete_rows(row_num)
                        removed += 1
                    except Exception as e:
                        print(f"[Delete] Failed row {row_num}: {e}")
                json_response(self, 200, {"ok": True, "removed": removed, "name": target_name})
                return

            # Find duplicate rows (by name, case-insensitive)
            seen = {}
            rows_to_delete = []
            for i, row in enumerate(all_values[1:], start=2):
                name = (row[0] or "").strip().lower()
                if not name:
                    continue
                if name in seen:
                    rows_to_delete.append(i)
                else:
                    seen[name] = i

            if not rows_to_delete:
                json_response(self, 200, {"ok": True, "removed": 0, "message": "No duplicates found"})
                return

            removed = 0
            for row_num in sorted(rows_to_delete, reverse=True):
                try:
                    sh.delete_rows(row_num)
                    removed += 1
                except Exception as e:
                    print(f"[Dedup] Failed row {row_num}: {e}")

            json_response(self, 200, {"ok": True, "removed": removed, "total_duplicates": len(rows_to_delete)})
        except Exception as e:
            json_response(self, 500, {"error": str(e)})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
