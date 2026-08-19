#!/usr/bin/env python3
"""Assert the built iOS app bundle still carries scanner privacy and Liquid Glass policy."""

from pathlib import Path
import plistlib
import sys


def strings_contents(path: Path) -> str:
    raw = path.read_bytes()
    if raw.startswith(b"bplist") or raw.lstrip().startswith(b"<?xml"):
        with path.open("rb") as handle:
            data = plistlib.load(handle)
        return "\n".join(str(value) for value in data.values())
    for encoding in ("utf-8-sig", "utf-8", "utf-16"):
        try:
            return path.read_text(encoding=encoding)
        except UnicodeDecodeError:
            continue
    raise UnicodeDecodeError("unknown", raw, 0, 1, f"cannot decode {path}")


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: test-built-app.py <QRScanner.app>", file=sys.stderr)
        return 2

    app = Path(sys.argv[1])
    info_path = app / "Info.plist"
    if not info_path.exists():
        print(f"error: missing {info_path}", file=sys.stderr)
        return 1

    with info_path.open("rb") as handle:
        info = plistlib.load(handle)

    expected = (
        "QR Scanner recognizes QR codes on this device. "
        "Camera frames are never uploaded or saved."
    )
    if info.get("NSCameraUsageDescription") != expected:
        print("error: NSCameraUsageDescription mismatch", file=sys.stderr)
        print(info.get("NSCameraUsageDescription"), file=sys.stderr)
        return 1

    if info.get("UIDesignRequiresCompatibility") is True:
        print("error: UIDesignRequiresCompatibility opts out of Liquid Glass", file=sys.stderr)
        return 1

    spanish = app / "es.lproj" / "InfoPlist.strings"
    if not spanish.exists():
        print(f"error: missing {spanish}", file=sys.stderr)
        return 1
    text = strings_contents(spanish)
    if "QR Scanner reconoce códigos QR en este dispositivo" not in text:
        print("error: Spanish camera usage string missing", file=sys.stderr)
        return 1

    print(f"ok {app}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
