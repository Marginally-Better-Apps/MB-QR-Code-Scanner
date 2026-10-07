#!/usr/bin/env python3
"""Write sample History for App Store screenshots into a Simulator app data container."""

import json
import sys
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

CHICAGO = (41.8827, -87.6233)
ROWS = [
    # kind, summary, payload, hours ago, place. The live scan in the capture flow lands on top.
    ("text", "Coffee beans and oat milk.", "Coffee beans and oat milk.", 0.2, None),
    ("contact", "Jamie Rivera",
     "BEGIN:VCARD\nVERSION:3.0\nFN:Jamie Rivera\nTEL:+15550104400\nEMAIL:jamie@example.com\nEND:VCARD", 0.5, None),
    ("url", "chicagoparkdistrict.com/parks-facilities/lincoln-park",
     "https://www.chicagoparkdistrict.com/parks-facilities/lincoln-park", 24, "Lincoln Park, Chicago"),
    ("product", "Product 5901234123457", "5901234123457", 25, None),
    ("text", "Meet by the lake at 10.", "Meet by the lake at 10.", 72, "Lakefront Trail, Chicago"),
]


def main() -> None:
    container = Path(sys.argv[1])
    now = datetime.now(ZoneInfo("America/Chicago")).replace(second=0, microsecond=0)
    events = []
    for kind, summary, payload, hours, place in ROWS:
        accepted = (now - timedelta(hours=hours)).isoformat()
        symbology = "VNBarcodeSymbologyEAN13" if kind == "product" else "VNBarcodeSymbologyQR"
        event = {
            "id": str(uuid.uuid4()), "acceptedAt": accepted, "kind": kind, "summary": summary,
            "original": payload, "parserVersion": 4, "format": {"rawValue": symbology},
        }
        if place:
            event["location"] = {"latitude": CHICAGO[0], "longitude": CHICAGO[1], "placeName": place,
                                 "capturedAt": accepted}
        events.append(event)
    path = container / "Documents/history/history-v1.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"version": 1, "events": events}))


if __name__ == "__main__":
    main()
