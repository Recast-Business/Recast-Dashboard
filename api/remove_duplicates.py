"""POST /api/remove_duplicates — Remove duplicate rows from the Google Sheet.
Keeps the first occurrence of each creator name, deletes subsequent duplicates.
"""
from http.server import BaseHTTPRequestHandler
from api._shared import _get_gsheet, json_response


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            sh = _get_gsheet()
            if sh is None:
                json_response(self, 500, {"error": "Could not connect to Google Sheets"})
                return

            all_values = sh.get_all_values()
            if len(all_values) < 2:
                json_response(self, 200, {"ok": True, "removed": 0})
                return

            # Find duplicate rows (by name, case-insensitive)
            seen = {}
            rows_to_delete = []  # 1-indexed row numbers
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

            # Delete from bottom up so row indices don't shift
            removed = 0
            for row_num in sorted(rows_to_delete, reverse=True):
                try:
                    sh.delete_rows(row_num)
                    removed += 1
                except Exception as e:
                    print(f"[Dedup] Failed to delete row {row_num}: {e}")

            json_response(self, 200, {"ok": True, "removed": removed, "total_duplicates": len(rows_to_delete)})
        except Exception as e:
            json_response(self, 500, {"error": str(e)})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
