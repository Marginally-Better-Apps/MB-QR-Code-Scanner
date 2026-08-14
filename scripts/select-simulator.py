#!/usr/bin/env python3
"""Print the UDID of an available iOS Simulator for a requested device family."""

import json
import subprocess
import sys


family = sys.argv[1] if len(sys.argv) > 1 else "iPhone"
if family not in {"iPhone", "iPad"}:
    raise SystemExit("usage: select-simulator.py [iPhone|iPad]")

data = json.loads(
    subprocess.check_output(
        ["xcrun", "simctl", "list", "devices", "available", "--json"],
        text=True,
    )
)

candidates = []
for runtime, devices in data.get("devices", {}).items():
    if "iOS" not in runtime:
        continue
    runtime_version = tuple(
        int(part) for part in runtime.rsplit("iOS-", 1)[-1].split("-") if part.isdigit()
    )
    for device in devices:
        if device.get("isAvailable") and family in device.get("name", ""):
            candidates.append(
                (runtime_version, device.get("state") == "Booted", device["name"], device["udid"])
            )

if not candidates:
    raise SystemExit(f"no available {family} simulator found")

newest_runtime = max(candidate[0] for candidate in candidates)
candidates = [candidate for candidate in candidates if candidate[0] == newest_runtime]

booted = [candidate for candidate in candidates if candidate[1]]
if booted:
    candidates = booted

preferred_names = (
    ("iPhone 17 Pro", "iPhone 17", "iPhone 16 Pro", "iPhone 16", "iPhone 15 Pro")
    if family == "iPhone"
    else ("iPad Pro 13-inch (M5)", "iPad Pro 11-inch (M5)", "iPad Air 13-inch (M4)")
)
by_name = {candidate[2]: candidate for candidate in candidates}
chosen = next((by_name[name] for name in preferred_names if name in by_name), None)
if chosen is None:
    chosen = sorted(candidates, key=lambda candidate: candidate[2])[0]

print(chosen[3])
