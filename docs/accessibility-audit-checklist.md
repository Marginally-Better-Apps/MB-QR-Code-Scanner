# Accessibility interaction audit checklist (QLT-02)

Manual VoiceOver pass for issue #30. Automated coverage lives in `accessibilityInteraction.test.tsx`, `ui.test.tsx`, and the QLT-01 chrome tests.

## Critical path

- [ ] Cold launch with VoiceOver: permission / ready state is a single understandable summary
- [ ] Accept one code: one announcement with the safe summary, no per-frame chatter
- [ ] Sticky actions: Open, Copy, Share, Details, Clear in that order, all hittable at 44 pt
- [ ] Two codes: chooser order matches on-screen top-to-bottom / left-to-right positions
- [ ] History delete: Delete action available without relying on color; Undo is 44 pt
- [ ] Redacted / Wi-Fi / auth results: no secret spoken; Copy/Share absent for session-only auth
- [ ] Reduce Motion: history swipe settles without spring bounce
- [ ] Reduced Transparency + Increase Contrast: chrome stays opaque and bordered, text remains readable
- [ ] Dynamic Type XXXL: sticky actions wrap instead of clipping off-screen

## Evidence

Attach a short VoiceOver recording of scan → sticky actions → history delete/undo when recording hardware is available.
