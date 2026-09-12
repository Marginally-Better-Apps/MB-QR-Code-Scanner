#!/usr/bin/env python3
"""Static policy tests for HIS-01 persistent scan history.

Guards the platform-level guarantees that Jest cannot observe directly:
the store stays local-only (no network capability in the history module)
and the app requests complete file protection for its sandbox files.
"""

import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
HISTORY = ROOT / "src" / "history"
APP_JSON = ROOT / "app.json"

# Any of these tokens inside src/history would mean the store gained a way
# to move scan data off the device.
NETWORK_TOKENS = (
    "fetch(",
    "XMLHttpRequest",
    "createUploadTask",
    "createDownloadTask",
    ".upload(",
    "expo-linking",
    "expo-sharing",
    "expo-mail-composer",
)


class HistoryStoragePolicyTests(unittest.TestCase):
    def test_history_module_has_no_network_capability(self) -> None:
        offenders = []
        for source in sorted(HISTORY.glob("*.ts")):
            if source.name.endswith(".test.ts"):
                continue
            text = source.read_text()
            for token in NETWORK_TOKENS:
                if token in text:
                    offenders.append(f"{source.name}: {token}")
        self.assertEqual(offenders, [])

    def test_history_module_never_imports_sharing_surfaces(self) -> None:
        offenders = []
        for source in sorted(HISTORY.glob("*.ts")):
            if source.name.endswith(".test.ts"):
                continue
            for line in source.read_text().splitlines():
                stripped = line.strip()
                if stripped.startswith("import ") and "expo-file-system/legacy" in stripped:
                    continue
                if stripped.startswith("import ") and (
                    "expo-sharing" in stripped
                    or "expo-linking" in stripped
                    or "expo-clipboard" in stripped
                ):
                    offenders.append(f"{source.name}: {stripped}")
        self.assertEqual(offenders, [])

    def test_production_store_lives_under_the_sandbox_document_directory(self) -> None:
        driver = (HISTORY / "historyExpoFileIO.ts").read_text()
        self.assertIn("documentDirectory", driver)
        self.assertIn("HISTORY_DIRECTORY_NAME", driver)

    def test_app_requests_complete_file_protection(self) -> None:
        config = json.loads(APP_JSON.read_text())
        entitlements = config["expo"]["ios"]["entitlements"]
        self.assertEqual(
            entitlements.get("com.apple.developer.default-data-protection"),
            "NSFileProtectionComplete",
        )

    def test_store_schema_version_is_pinned(self) -> None:
        store = (HISTORY / "historyStore.ts").read_text()
        self.assertIn("HISTORY_SCHEMA_VERSION = 1", store)
        self.assertIn("version: HISTORY_SCHEMA_VERSION", store)


if __name__ == "__main__":
    unittest.main()
