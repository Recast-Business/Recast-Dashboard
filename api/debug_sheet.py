"""GET /api/debug_sheet — Debug endpoint to inspect raw Google Sheet structure."""
from http.server import BaseHTTPRequestHandler
from api._shared import _get_gsheet, _find_name_col, json_response


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            sh = _get_gsheet()
            if sh is None:
                json_response(self, 500, {"error": "Could not connect to Google Sheets"})
                return

            all_values = sh.get_all_values()
            if not all_values:
                json_response(self, 200, {"error": "Sheet is empty", "rows": 0})
                return

            headers = all_values[0]
            first_3_rows = all_values[1:4] if len(all_values) > 1 else []

            # Find the Creator Name column
            name_col_idx = _find_name_col(sh)  # 1-based
            name_col_header = headers[name_col_idx - 1] if name_col_idx <= len(headers) else "N/A"

            # First 5 values from that column (skip header)
            name_col_values = []
            for row in all_values[1:6]:
                if name_col_idx - 1 < len(row):
                    name_col_values.append(row[name_col_idx - 1])
                else:
                    name_col_values.append("")

            json_response(self, 200, {
                "ok": True,
                "total_rows": len(all_values),
                "total_columns": len(headers),
                "headers": headers,
                "first_3_rows": first_3_rows,
                "creator_name_col_index": name_col_idx,
                "creator_name_col_header": name_col_header,
                "first_5_names": name_col_values,
            })
        except Exception as e:
            json_response(self, 500, {"error": str(e)})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
