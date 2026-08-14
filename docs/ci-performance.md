# CI performance evidence

Story: [#3 Speed up CI and PR feedback](https://github.com/Marginally-Better-Apps/MB-QR-Code-Scanner/issues/3)

Durations are wall-clock time from the GitHub Actions run `created_at` timestamp through
`updated_at`. "All PR checks" is measured from the shared `pull_request` event time until
the last of CI, PR title, and PR unsigned IPA completed.

## Baseline

These are the three most recent comparable successful runs from PR #2 before the change.
All three restored the exact 44 MB DerivedData cache key.

| Commit validation | Main CI | PR title | PR unsigned IPA | All PR checks green | Critical path |
| --- | ---: | ---: | ---: | ---: | --- |
| [Run 31770373618](https://github.com/Marginally-Better-Apps/MB-QR-Code-Scanner/actions/runs/31770373618) | 4:52 | 0:07 | 0:29 | 4:52 | iOS tests; 1:52 runner wait plus 2:44 test step |
| [Run 31769666157](https://github.com/Marginally-Better-Apps/MB-QR-Code-Scanner/actions/runs/31769666157) | 5:25 | 0:07 | 0:31 | 5:25 | iOS tests; 4:59 test step |
| [Run 31769055930](https://github.com/Marginally-Better-Apps/MB-QR-Code-Scanner/actions/runs/31769055930) | 4:56 | 0:08 | 0:43 | 4:56 | iOS tests; 4:33 test step |
| Median | **4:56** | **0:07** | **0:31** | **4:56** | iOS tests |

Within the iOS test step, Xcode spent 146–258 seconds starting a parallel-testing clone
for a suite containing one test bundle. Cache restoration took 3–4 seconds, but the
workflow still invoked `xcodebuild test`, so an exact cache hit did not bypass the build.
The script and iOS jobs already ran independently; the iOS job determined merge readiness.

## Changes to the critical path

- Split the Xcode operation into a cold-cache `build-for-testing` and an unconditional
  `test-without-building`, allowing an exact warm hit to bypass compilation.
- Disable parallel-test simulator cloning for the single test bundle and overlap simulator
  boot with cache restoration/build work on the faster macOS 14 runner image.
- Include the runner architecture, Xcode version, project, Swift sources, tests, and asset
  catalogs in the test-build cache key. A toolchain-matched fallback cache remains safe
  because a non-exact hit always takes the build-for-testing path.
- Keep the independent Ubuntu policy tests, iPhone simulator tests, PR title validation,
  and unsigned IPA archive running in parallel.
- Key concurrency by workflow and PR number (or ref for non-PR dispatches), cancelling
  superseded runs in every PR-triggered workflow.
- Preserve release-policy tests, iPhone/iPad device-family validation, unsigned IPA
  packaging, and the tagless-release workflow.

## Post-change evidence

| Validation | Main CI | PR title | PR unsigned IPA | All PR checks green | Cache evidence |
| --- | ---: | ---: | ---: | ---: | --- |
| [Cold CI / final PR set](https://github.com/Marginally-Better-Apps/MB-QR-Code-Scanner/actions/runs/31772596229) | 5:45 | 0:06 | [0:41](https://github.com/Marginally-Better-Apps/MB-QR-Code-Scanner/actions/runs/31772596222) | 5:45 | Test-build key missed, then saved successfully |
| [Warm 1](https://github.com/Marginally-Better-Apps/MB-QR-Code-Scanner/actions/runs/31772949309) | 3:35 | 0:06 | [0:35](https://github.com/Marginally-Better-Apps/MB-QR-Code-Scanner/actions/runs/31772949358) | 3:35 | Exact test-build key restored; build step skipped |
| [Warm 2](https://github.com/Marginally-Better-Apps/MB-QR-Code-Scanner/actions/runs/31773174936) | 3:49 | 0:05 | [0:30](https://github.com/Marginally-Better-Apps/MB-QR-Code-Scanner/actions/runs/31773174921) | 3:49 | Exact test-build key restored; build step skipped |
| [Warm 3](https://github.com/Marginally-Better-Apps/MB-QR-Code-Scanner/actions/runs/31773436627) | 2:10 | 0:09 | [0:31](https://github.com/Marginally-Better-Apps/MB-QR-Code-Scanner/actions/runs/31773436619) | 2:10 | Exact test-build and archive keys restored; build step skipped |
| Warm median | **3:35** | **0:06** | **0:31** | **3:35** | Exact cache hits in all three runs |

The cold run preserved every check and artifact. Its iOS critical path was 0:12 to select
and request simulator boot, a 0:34 cache miss lookup, a 3:35 test build, 0:51 to finish boot
and execute tests, and 0:06 for device-family validation. Simulator boot overlapped the cache
lookup and test build. The following three PR synchronizations provide warm-cache evidence.

The unsigned IPA cache's independent [cold run](https://github.com/Marginally-Better-Apps/MB-QR-Code-Scanner/actions/runs/31771011467)
missed and saved the final archive v2 key; all three warm rows restored that exact key. The
warm median is **1:21 (27%) faster** than the 4:56 baseline median for both main CI and all
PR checks. Every warm run was also faster than every baseline run.

## Remaining bottlenecks and tradeoffs

- Simulator initialization and launch remain the critical path and account for most of the
  1:39 spread between warm runs. Boot is started before cache restoration so useful work
  overlaps it, but hosted-runner variance remains.
- Exact test-build reuse applies only when project, source, test, assets, runner architecture,
  and Xcode toolchain inputs match. Changed build inputs intentionally take the cold build
  path; toolchain-matched fallback data only accelerates that mandatory rebuild.
- Simulator tests use the macOS 14 image because it was materially faster here. The PR IPA
  and release archive remain on macOS 15, so the newer release toolchain safeguard is intact.
- Independent Linux policy checks, simulator tests, title validation, and IPA packaging all
  continue in parallel. [Run 31772166995](https://github.com/Marginally-Better-Apps/MB-QR-Code-Scanner/actions/runs/31772166995)
  was cancelled immediately after a superseding push, demonstrating stale-run cancellation.
