"""Read a small D1 database consistently through the allowed Cloudflare API."""
import json
import os
import pathlib
import sys
import urllib.request
import urllib.error
from snapshot_sql import literal, identifier, render_snapshot

account = os.environ.get("CLOUDFLARE_ACCOUNT_ID")
database = os.environ.get("CLOUDFLARE_DATABASE_ID")
if not account or not database:
    raise SystemExit("Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_DATABASE_ID")
endpoint = f"https://api.cloudflare.com/client/v4/accounts/{account}/d1/database/{database}/query"

def query(sql):
    request = urllib.request.Request(endpoint, data=json.dumps({"sql": sql}).encode(), headers={"Authorization": "Bearer " + os.environ["CLOUDFLARE_API_TOKEN"], "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        raise SystemExit(f"D1 snapshot query failed (HTTP {error.code})") from None
    if not result.get("success") or not result.get("result", [{}])[0].get("success"):
        raise SystemExit("D1 snapshot query failed; no completed backup was published")
    return result["result"][0]["results"]

schema_query = "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name"
schema = query(schema_query)
tables = sorted((row["name"] for row in schema if row["type"] == "table"), key=lambda name: (name == "sessions", name != "users", name))
expected = {"users", "sessions", "people", "config", "audit", "login_limits", "d1_migrations"}
if set(tables) != expected:
    raise SystemExit("Unexpected schema; use native D1 export for this database")
parts = []
columns_by_table = {}
for name in tables:
    columns = query("SELECT name,pk FROM pragma_table_info(" + literal(name) + ") ORDER BY cid")
    columns_by_table[name] = columns
    parts.append("json((SELECT COALESCE(json_group_array(json_array(" + ",".join(identifier(column["name"]) for column in columns) + ")), '[]') FROM " + identifier(name) + "))")
# One SELECT takes one SQLite read snapshot across every application table.
sql = "SELECT json_object('schema',json((SELECT json_group_array(json_object('type',type,'name',name,'tbl_name',tbl_name,'sql',sql)) FROM (" + schema_query + "))),'rows',json_array(" + ",".join(parts) + "),'sequence',json((SELECT json_group_array(json_object('name',name,'seq',seq)) FROM sqlite_sequence))) AS snapshot"
snapshot = json.loads(query(sql)[0]["snapshot"])
if snapshot["schema"] != schema:
    raise SystemExit("Schema changed during backup; retry export")
path = pathlib.Path(sys.argv[1])
with path.open("x", encoding="utf8") as output:
    output.write(render_snapshot(schema, tables, columns_by_table, snapshot["rows"], snapshot["sequence"]))
path.chmod(0o600)
