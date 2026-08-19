#!/usr/bin/env python3
"""Regression tests for pull-request workflow performance and safeguards."""

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS = ROOT / ".github" / "workflows"


def workflow(name: str) -> str:
    return (WORKFLOWS / name).read_text()


class PullRequestWorkflowTests(unittest.TestCase):
    def test_every_pr_workflow_cancels_superseded_runs(self) -> None:
        for name in ("ci.yml", "pr-title.yml", "unsigned-ipa.yml"):
            with self.subTest(workflow=name):
                text = workflow(name)
                self.assertRegex(
                    text,
                    r"concurrency:\s+group: .*github\.event\.pull_request\.number"
                    r".*\|\| github\.ref.*\s+cancel-in-progress: true",
                )

    def test_ci_jobs_remain_independent(self) -> None:
        text = workflow("ci.yml")
        scripts_job = text[text.index("  scripts:") : text.index("  ios:")]
        ios_job = text[text.index("  ios:") :]
        self.assertNotIn("needs:", scripts_job)
        self.assertNotIn("needs:", ios_job)

    def test_simulator_tests_use_the_faster_compatible_runner_image(self) -> None:
        text = workflow("ci.yml")
        ios_job = text[text.index("  ios:") :]
        self.assertIn("runs-on: macos-14", ios_job)

    def test_ipa_and_release_select_an_ios_26_sdk_xcode(self) -> None:
        for name in ("unsigned-ipa.yml", "release.yml"):
            with self.subTest(workflow=name):
                text = workflow(name)
                self.assertIn("xcode-select", text)
                self.assertIn("Xcode_26", text)
                self.assertLess(text.index("xcode-select"), text.index("xcodebuild archive"))

    def test_ci_cache_is_invalidated_by_toolchain_and_build_inputs(self) -> None:
        text = workflow("ci.yml")
        self.assertIn("id: xcode", text)
        self.assertIn("xcodebuild -version", text)
        self.assertIn("id: test-build-cache", text)
        self.assertIn("steps.xcode.outputs.cache-key", text)
        for build_input in (
            "QRScanner.xcodeproj/**",
            "QRScanner/**/*.swift",
            "QRScanner/**/*.xcassets/**",
            "QRScannerTests/**/*.swift",
            "QRScannerUITests/**/*.swift",
        ):
            with self.subTest(build_input=build_input):
                self.assertIn(build_input, text)

    def test_cold_cache_builds_before_running_tests(self) -> None:
        text = workflow("ci.yml")
        self.assertIn("if: steps.test-build-cache.outputs.cache-hit != 'true'", text)
        self.assertIn("xcodebuild build-for-testing", text)

    def test_warm_cache_reuses_test_build_without_rebuilding(self) -> None:
        text = workflow("ci.yml")
        self.assertIn("xcodebuild test-without-building", text)
        self.assertNotRegex(text, r"xcodebuild test \\")

    def test_single_test_bundle_does_not_create_parallel_simulator_clones(self) -> None:
        text = workflow("ci.yml")
        self.assertGreaterEqual(text.count("-parallel-testing-enabled NO"), 2)

    def test_existing_validation_and_device_support_are_preserved(self) -> None:
        ci = workflow("ci.yml")
        ipa = workflow("unsigned-ipa.yml")
        release = workflow("release.yml")
        self.assertIn("python3 scripts/test-semantic-version.py", ci)
        self.assertIn('test "$FAMILY" = "1,2"', ci)
        self.assertIn("xcodebuild archive", ipa)
        self.assertIn("xcodebuild archive", release)
        self.assertIn("Package IPA", ipa)
        self.assertIn("Package IPA", release)

    def test_pr_ipa_publishes_a_tappable_autoloader_preview(self) -> None:
        ipa = workflow("unsigned-ipa.yml")
        self.assertIn("contents: write", ipa)
        self.assertIn("pull-requests: write", ipa)
        self.assertIn("gh release create", ipa)
        self.assertIn('TAG="pr-${PR_NUMBER}"', ipa)
        self.assertIn("target-folder: pr/", ipa)
        self.assertIn("write-autoloader-page.py", ipa)
        self.assertIn("github.io", ipa)
        self.assertIn("autoloader-pr-preview", ipa)
        self.assertIn("head.repo.full_name == github.repository", ipa)
        self.assertNotIn("nightly.link", ipa)
        self.assertNotRegex(ipa, r"(?m)^EOF$")

    def test_closed_prs_delete_the_preview_release(self) -> None:
        text = workflow("pr-preview-cleanup.yml")
        self.assertIn("types: [closed]", text)
        self.assertIn("gh release delete", text)
        self.assertIn("--cleanup-tag", text)
        self.assertIn("TAG: pr-", text)


if __name__ == "__main__":
    unittest.main()
