#!/usr/bin/env python3
"""Cliente minimo de MCP Streamable HTTP para el servidor oficial de Meta.

Uso:
    python3 meta_mcp.py list
    python3 meta_mcp.py call <herramienta> '<json de argumentos>'
"""
import json
import sys
import urllib.request

URL = "https://mcp.facebook.com/devtools"
CRED = "/home/arch-tarok/.claude/.credentials.json"


def token():
    with open(CRED) as fh:
        d = json.load(fh)
    for k, v in (d.get("mcpOAuth") or {}).items():
        if k.startswith("meta_social_technologies") and isinstance(v, dict):
            t = v.get("accessToken")
            if t:
                return t
    raise SystemExit("No hay token para meta_social_technologies")


class Client:
    def __init__(self):
        self.sid = None
        self.n = 0

    def rpc(self, method, params=None, notify=False):
        self.n += 1
        payload = {"jsonrpc": "2.0", "method": method}
        if not notify:
            payload["id"] = self.n
        if params is not None:
            payload["params"] = params

        headers = {
            "Authorization": "Bearer " + token(),
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "MCP-Protocol-Version": "2025-06-18",
        }
        if self.sid:
            headers["Mcp-Session-Id"] = self.sid

        req = urllib.request.Request(
            URL, data=json.dumps(payload).encode(), headers=headers, method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                sid = resp.headers.get("Mcp-Session-Id")
                if sid:
                    self.sid = sid
                body = resp.read().decode("utf-8", "replace")
                ctype = resp.headers.get("Content-Type", "")
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            print(f"[HTTP {e.code}] {e.headers.get('Content-Type','')}", file=sys.stderr)
            print(body[:2000], file=sys.stderr)
            raise SystemExit(1)

        if notify:
            return None
        if "text/event-stream" in ctype:
            for line in body.splitlines():
                if line.startswith("data:"):
                    chunk = line[5:].strip()
                    if chunk:
                        msg = json.loads(chunk)
                        if msg.get("id") == self.n:
                            return msg
            return None
        msg = json.loads(body)
        if msg.get("id") == self.n or "result" in msg or "error" in msg:
            return msg
        return None

    def call_tool(self, name, args):
        return self.rpc("tools/call", {"name": name, "arguments": args})


def text_of(msg):
    """Aplana el contenido de un resultado de herramienta."""
    if msg is None:
        return "(sin respuesta)"
    if "error" in msg:
        return "ERROR: " + json.dumps(msg["error"], ensure_ascii=False, indent=2)
    res = msg.get("result") or {}
    out = []
    for item in res.get("content") or []:
        if item.get("type") == "text":
            out.append(item.get("text", ""))
        else:
            out.append(json.dumps(item, ensure_ascii=False))
    if res.get("structuredContent"):
        out.append(json.dumps(res["structuredContent"], ensure_ascii=False, indent=2))
    return "\n".join(out) or json.dumps(res, ensure_ascii=False, indent=2)


def main():
    c = Client()
    init = c.rpc(
        "initialize",
        {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "jk-diag", "version": "1.0"},
        },
    )
    print("== initialize ==")
    print(json.dumps((init or {}).get("result", init), ensure_ascii=False, indent=2)[:1500])
    c.rpc("notifications/initialized", {}, notify=True)

    cmd = sys.argv[1] if len(sys.argv) > 1 else "list"

    if cmd == "list":
        msg = c.rpc("tools/list", {})
        for t in (msg or {}).get("result", {}).get("tools", []):
            print(f"\n### {t['name']}")
            print(f"    {t.get('description','')[:400]}")
            schema = t.get("inputSchema") or {}
            props = schema.get("properties") or {}
            if props:
                for k, v in props.items():
                    print(f"      - {k}: {v.get('type','?')} {v.get('description','')[:120]}")
        return

    if cmd == "call":
        name = sys.argv[2]
        args = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
        print(f"\n== tools/call {name} {args} ==")
        print(text_of(c.call_tool(name, args)))
        return

    raise SystemExit(f"comando desconocido: {cmd}")


main()
