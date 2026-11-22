#!/usr/bin/env python3
"""Regenerate src/shared/customerRoster.ts from the client manifest.

Usage: python3 tools/gen_customer_roster.py   (run from the repo root)

The client manifest (src/client/world/customers.manifest.json, written by
P2's blender/build_customers.py) is the source of truth. The server needs
the same (id, location) pairs in the SAME ORDER to re-run the client's
seeded guest pick (guests.ts) in the fallback-night generator
(src/server/fallback.ts). guests.test.ts fails if the two drift.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "src/client/world/customers.manifest.json"
OUT = ROOT / "src/shared/customerRoster.ts"


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    lines = [
        "// src/shared/customerRoster.ts — GENERATED, do not hand-edit.",
        "// Slim copy of src/client/world/customers.manifest.json (id + location only,",
        "// SAME ORDER): the server needs it to re-run the client's seeded guest pick",
        "// (guests.ts) in the fallback-night generator (src/server/fallback.ts).",
        "// Regenerate with: python3 tools/gen_customer_roster.py",
        "// guests.test.ts fails loudly if this drifts from the manifest.",
        "import type { GuestRosterEntry } from './guests';",
        "",
        "export const CUSTOMER_ROSTER: readonly GuestRosterEntry[] = [",
    ]
    for entry in manifest:
        lines.append(f"  {{ id: '{entry['id']}', location: '{entry['location']}' }},")
    lines.append("];")
    lines.append("")
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {len(manifest)} entries to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
