# Accessibility checks

The SwiftUI app uses native navigation, menus, buttons, list rows, and swipe actions. Result and History labels contain sanitized display text. Detection outlines are decorative and hidden from VoiceOver.

Verify VoiceOver can open each result menu, invoke an action, navigate History, delete a row, and Undo. Confirm Dynamic Type scales row heights, long values remain available in Details, and Reduce Transparency replaces glass with an opaque system background.

On iPad, verify portrait, landscape, and narrow Split View. Run the physical checks in `physical-checklist.md` before shipping.
