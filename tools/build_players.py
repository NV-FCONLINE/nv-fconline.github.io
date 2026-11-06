"""Build club/players/<xx>.json: FC Online player names from the NEXON Open API metadata.

Usage: python tools/build_players.py
- Downloads https://open.api.nexon.com/static/fconline/meta/spid.json (about 7MB, no key needed).
- Writes 256 shards keyed by pid (spid % 1000000): shard = pid % 256 as two hex digits.
  The club page fetches only the shards it needs.
- NEXON terms: data from the API must be refreshed within 30 days, so a weekly GitHub Action reruns this.
"""

import json
import os
import sys
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone

URL = "https://open.api.nexon.com/static/fconline/meta/spid.json"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "club", "players")


def main() -> int:
    req = urllib.request.Request(URL, headers={"User-Agent": "nv-fconline-site-build"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.load(r)
    if not isinstance(data, list) or len(data) < 1000:
        print("spid.json looks wrong; keeping the old files", file=sys.stderr)
        return 1

    names = defaultdict(Counter)
    for e in data:
        try:
            spid = int(e["id"])
            name = str(e["name"]).strip()
        except (KeyError, TypeError, ValueError):
            continue
        if name:
            names[spid % 1000000][name] += 1

    shards = defaultdict(dict)
    for pid, c in names.items():
        shards[pid % 256][str(pid)] = c.most_common(1)[0][0]

    os.makedirs(OUT, exist_ok=True)
    for b in range(256):
        rows = dict(sorted(shards.get(b, {}).items(), key=lambda kv: int(kv[0])))
        with open(os.path.join(OUT, f"{b:02x}.json"), "w", encoding="utf-8", newline="\n") as f:
            json.dump(rows, f, ensure_ascii=False, separators=(",", ":"))
    meta = {
        "source": "NEXON Open API (FC Online spid metadata)",
        "players": len(names),
        "built_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    with open(os.path.join(OUT, "meta.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print(f"{len(names)} players -> {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
