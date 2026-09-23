#!/usr/bin/env python3
"""Keep native builds, release validation, and public PR previews wired together."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class WorkflowTests(unittest.TestCase):
    def test_all_builds_use_native_xcode_project(self):
        for name in ("ci.yml", "unsigned-ipa.yml", "release.yml"):
            text = (ROOT / ".github/workflows" / name).read_text()
            with self.subTest(workflow=name):
                self.assertIn("-project native/QRScanner.xcodeproj", text)
                self.assertIn("Xcode_26", text)
                self.assertIn("-configuration Release", text)
                for obsolete in ("npm ci", "expo prebuild", "pod install", "RCT_NO_LAUNCH_PACKAGER"):
                    self.assertNotIn(obsolete, text)

    def test_tests_and_real_native_ui_run_in_ci(self):
        text = (ROOT / ".github/workflows/ci.yml").read_text()
        for check in ("swift test", "test-native-qr-decoder.sh", "test-built-app.py", "e2e/native-ui-acceptance.yaml", "e2e/native-image-scan-acceptance.yaml"):
            self.assertIn(check, text)
        flow = (ROOT / "e2e/native-ui-acceptance.yaml").read_text()
        self.assertGreaterEqual(flow.count('direction: LEFT'), 2)
        self.assertGreaterEqual(flow.count('id: "history-undo"'), 2)
        self.assertNotIn("optional: true", flow)
        self.assertNotIn("history-row-swipe-full", flow)
        image_flow = (ROOT / "e2e/native-image-scan-acceptance.yaml").read_text()
        self.assertIn('nativeImageFixture: "normal-qr"', image_flow)
        self.assertIn('nativeImageFixture: "damaged-distant-qr"', image_flow)
        self.assertIn('id: "history-row"', image_flow)
        self.assertNotIn("scannerFixture:", image_flow)
        self.assertNotIn("optional: true", image_flow)

    def test_app_has_no_javascript_runtime_or_package_dependency(self):
        self.assertFalse((ROOT / "package.json").exists())
        project = (ROOT / "native/QRScanner.xcodeproj/project.pbxproj").read_text()
        self.assertIn('TARGETED_DEVICE_FAMILY = "1,2"', project)
        self.assertIn("com.marginallybetter.qrscanner", project)
        self.assertNotIn("PBXShellScriptBuildPhase", project)

    def test_autoloader_preview_is_public_and_fork_safe(self):
        text = (ROOT / ".github/workflows/unsigned-ipa.yml").read_text()
        for value in ("gh release create", 'TAG="pr-${PR_NUMBER}"', "write-autoloader-page.py", "github.io", "head.repo.full_name == github.repository", "assert-native-ipa.sh"):
            self.assertIn(value, text)
        self.assertNotIn("nightly.link", text)
        cleanup = (ROOT / ".github/workflows/pr-preview-cleanup.yml").read_text()
        self.assertIn("types: [closed]", cleanup)
        self.assertIn("--cleanup-tag", cleanup)

if __name__ == "__main__":
    unittest.main()
