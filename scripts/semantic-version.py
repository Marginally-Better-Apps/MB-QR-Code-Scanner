#!/usr/bin/env python3
"""Calculate a tagless semantic version from first-parent commit messages."""

import re
import subprocess
import sys


CONVENTIONAL = re.compile(
    r"^(?P<type>fix|feat)(?:\([^)]*\))?(?P<breaking>!)?:\s+.+$"
)


def bump(version: tuple[int, int, int], message: str) -> tuple[int, int, int]:
    """Apply the first releasable Conventional Commit line in a commit message."""
    matches = (
        CONVENTIONAL.match(line.strip()) for line in message.splitlines() if line.strip()
    )
    match = next((candidate for candidate in matches if candidate is not None), None)
    if match is None:
        return version

    major, minor, patch = version
    if match.group("type") == "fix" and match.group("breaking"):
        return version
    if match.group("breaking"):
        return major + 1, 0, 0
    if match.group("type") == "feat":
        return major, minor + 1, 0
    return major, minor, patch + 1


def version_from_messages(messages: list[str]) -> tuple[int, int, int]:
    version = (0, 0, 0)
    for message in messages:
        version = bump(version, message)
    return version


def git_messages(revision: str) -> list[str]:
    raw = subprocess.check_output(
        ["git", "log", "--first-parent", "--reverse", "--format=%B%x00", revision],
        text=True,
    )
    return [message for message in raw.split("\0") if message.strip()]


if __name__ == "__main__":
    revision = sys.argv[1] if len(sys.argv) > 1 else "HEAD"
    print(".".join(map(str, version_from_messages(git_messages(revision)))))
