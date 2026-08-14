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


if __name__ == "__main__":
    unittest.main()
