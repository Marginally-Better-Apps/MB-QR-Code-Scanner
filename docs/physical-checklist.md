# Physical-device camera checklist (QLT-06, issue #34)

Automated coverage lives in `e2e/acceptance-journey.yaml` (fixture-driven scanner/history path),
`e2e/smoke.yaml` (fixture-driven smoke), and `src/scanner/acceptanceJourney.test.ts`.
Camera, optics, and thermal behavior cannot be proven on Simulator; run this checklist on
physical iPhone + iPad hardware and attach results to the release PR or release record.

## Setup

- [ ] Release archive with embedded JS bundle (no Metro). Record device model, iOS version, build number.
- [ ] Clean install. Grant camera when prompted. Confirm Scanner is the first tab.
- [ ] Automated acceptance recording (`acceptance-journey`) is attached and H.264 playable.

## Permission recovery

- [ ] Deny camera in Settings → confirm denied state with labeled Open Settings action.
- [ ] Re-grant from Settings → return to app → live preview resumes without relaunch.
- [ ] Toggle permission off/on mid-scan → sticky result for safe codes persists; session-only auth codes drop.

## Focus / zoom

- [ ] Tap-to-focus on a small/distant code → focus locks and code accepts.
- [ ] Pinch-zoom to a far code → zoom follows gesture and code accepts; zoom resets sanely on tab switch.
- [ ] Low-light code → focus hunts at most briefly, then accepts or shows ready state (no freeze).

## Edge codes

- [ ] Codes at left/right/top/bottom preview edges highlight with corner bounds and accept.
- [ ] Partially cropped code at the edge does not accept until fully visible (no false accept).

## Simultaneous codes

- [ ] Two codes side-by-side → chooser appears, order matches on-screen positions, selection sticks.
- [ ] Three codes top→bottom → chooser lists all three with kind text, tap selects the intended payload.

## Rotation / resizing

- [ ] Rotate iPhone portrait ↔ landscape mid-scan → preview fills, bounds track, sticky result stays.
- [ ] iPad split-view resize + Slide Over → list/grid history layout adapts, no clipped actions.
- [ ] Dynamic Type XXXL → sticky actions wrap, History rows remain tappable at 44 pt.

## 10-minute thermal soak

- [ ] Continuous 10-minute scan on device → no thermal warning, no dropped capture, accept latency stays sane.
- [ ] Low-power mode (when enabled) → frame skip active, device stays warm (not hot).
- [ ] Attach Xcode Organizer thermal-pressure log or note device warmth + elapsed time.

## Evidence

Attach the automated `acceptance-journey` H.264 recording plus this completed checklist
(photos or short clips for focus/zoom, edge, multi-code, rotation, and thermal notes).
