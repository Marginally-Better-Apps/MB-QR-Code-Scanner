#!/usr/bin/env python3
"""Regression tests for the QLT-06 acceptance journey (issue #34)."""

from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
E2E = ROOT / "e2e"


def flow(name: str) -> str:
    return (E2E / name).read_text()


def flow_commands(text: str) -> list[str]:
    return [
        line.strip()
        for line in text.splitlines()
        if line.strip().startswith("- ")
    ]


class AcceptanceJourneyTests(unittest.TestCase):
    def test_acceptance_flow_covers_signature_scanner_history_path(self) -> None:
        text = flow("acceptance-journey.yaml")
        self.assertIn('appId: com.marginallybetter.qrscanner', text)
        self.assertIn('clearState: true', text)
        self.assertIn('cameraFixture: "authorized"', text)
        self.assertIn('scannerFixture: "acceptance-first"', text)
        # Injects URL fixture and observes the result accessory.
        self.assertIn('sticky-result-accessory', text)
        self.assertIn('https://example.com/acceptance-first', text)
        # Removes the code and proves the sticky result remains.
        self.assertIn('fixture-clear', text)
        # Injects a different code and proves replacement.
        self.assertIn('fixture-inject-second', text)
        self.assertIn('https://example.com/acceptance-second', text)
        # Opens History and replays the first safe result.
        self.assertIn('open-history', text)
        self.assertIn('history-detail', text)
        self.assertIn('sticky-result-open', text)
        self.assertIn('example.com/acceptance-first', text)
        # Exercises trailing swipe deletion and verifies the row is gone.
        self.assertIn('direction: LEFT', text)
        self.assertIn('history-row-delete', text)
        self.assertIn('history-undo', text)
        self.assertIn('assertNotVisible', text)
        self.assertIn('example.com/acceptance-second', text)

    def test_acceptance_recording_starts_after_setup_and_stops_last(self) -> None:
        text = flow("acceptance-journey.yaml")

        def line_number(needle: str) -> int:
            for i, line in enumerate(text.splitlines()):
                if needle in line:
                    return i
            raise AssertionError(f"missing {needle}")

        launch = line_number('launchApp')
        first_assert = line_number('assertVisible')
        start = line_number('startRecording')
        stop = line_number('stopRecording')
        self.assertLess(launch, first_assert)
        self.assertLess(first_assert, start)
        self.assertLess(start, stop)

        commands = flow_commands(text)
        self.assertEqual(commands[-1], '- stopRecording')

    def test_smoke_flow_is_fixture_driven_product_acceptance(self) -> None:
        text = flow("smoke.yaml")
        self.assertIn('scannerFixture: "acceptance-first"', text)
        self.assertIn('sticky-result-accessory', text)
        self.assertIn('https://example.com/acceptance-first', text)
        self.assertIn('open-history', text)
        self.assertNotIn('Camera Unavailable', text)
        self.assertNotIn('Accepted scans appear here.', text)
        commands = flow_commands(text)
        self.assertEqual(commands[-1], '- stopRecording')
        self.assertTrue(any(cmd.startswith('- startRecording') for cmd in commands))

    def test_physical_checklist_covers_camera_behavior(self) -> None:
        checklist = (ROOT / "docs" / "physical-checklist.md").read_text().lower()
        for topic in (
            "permission",
            "focus",
            "zoom",
            "edge",
            "simultaneous",
            "rotation",
            "resiz",
            "thermal",
            "10-minute",
        ):
            with self.subTest(topic=topic):
                self.assertIn(topic, checklist)

    def test_fixture_controls_are_wired_for_maestro(self) -> None:
        fixtures = (ROOT / "src" / "scanner" / "fixtures.ts").read_text()
        self.assertIn('ACCEPTANCE_FIRST_URL', fixtures)
        self.assertIn('ACCEPTANCE_SECOND_URL', fixtures)
        self.assertIn('acceptance-first', fixtures)
        factory = (ROOT / "src" / "scanner" / "factory.ts").read_text()
        self.assertIn("acceptance-first", factory)
        session = (ROOT / "src" / "scanner" / "session.ts").read_text()
        self.assertIn('debugFixtureInject', session)
        self.assertIn('debugFixtureClear', session)
        screen = (ROOT / "src" / "components" / "ScannerScreen.tsx").read_text()
        self.assertIn('fixture-inject-first', screen)
        self.assertIn('fixture-clear', screen)
        self.assertIn('fixture-inject-second', screen)
        self.assertIn('fixture-controls', screen)


if __name__ == "__main__":
    unittest.main()
