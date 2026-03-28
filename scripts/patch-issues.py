import os, sys, time, json
from urllib import request, error

TOKEN = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("GITHUB_TOKEN")
REPO  = "Hahfyeex/Stellar-PolyMarket"
DIR   = os.path.join(os.path.dirname(__file__), "issue-bodies")

def patch(num):
    path = os.path.join(DIR, f"{num}.md")
    if not os.path.exists(path):
        print(f"SKIP #{num} (no file)")
        return
    with open(path, encoding="utf-8", errors="replace") as f:
        body = f.read()
    payload = json.dumps({"body": body}).encode("utf-8")
    url = f"https://api.github.com/repos/{REPO}/issues/{num}"
    req = request.Request(url, data=payload, method="PATCH")
    req.add_header("Authorization", f"token {TOKEN}")
    req.add_header("Accept", "application/vnd.github.v3+json")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "kiro-patcher")
    try:
        with request.urlopen(req) as resp:
            data = json.loads(resp.read())
            print(f"OK #{num}: {data['title']}")
    except error.HTTPError as e:
        print(f"FAIL #{num}: {e.code} {e.reason} — {e.read().decode()[:120]}")
    time.sleep(1.5)

for n in range(116, 156):
    patch(n)

print("ALL DONE")
