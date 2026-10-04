import Foundation
import Testing
@testable import QRScannerCore

@MainActor
private struct Harness {
  let clock = TestClock()
  let camera: FakeCamera
  let feedback = FakeFeedback()
  let repository: InMemoryHistory
  let history: HistoryViewModel
  let scanner: ScannerViewModel

  init(_ authorization: CameraAuthorization = .authorized, events: [HistoryEvent] = [], simulatedScene: [Detection]? = nil) {
    camera = FakeCamera(authorization)
    let repository = InMemoryHistory(events)
    self.repository = repository
    history = HistoryViewModel(clock: clock, open: { repository })
    scanner = ScannerViewModel(camera: camera, history: history, feedback: feedback, clock: clock, simulatedScene: simulatedScene)
  }

  /// Delivers the same frame twice, 100 ms apart, which is enough to accept a code.
  func show(_ detections: [Detection]) {
    scanner.receive(detections)
    clock.now += 0.1
    scanner.receive(detections)
  }
}

private let url = Detection("https://example.com/a")
private let secret = Detection("otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP")

// MARK: - Scanner

@MainActor @Test func cameraPermissionIsRequestedOnceThenCaptureStarts() async {
  let harness = Harness(.notDetermined)
  harness.scanner.setPhase(.active)
  #expect(harness.scanner.cameraState == .requesting)
  #expect(!harness.scanner.isCapturing)
  // The permission prompt makes the scene inactive and then active again.
  harness.scanner.setPhase(.inactive)
  harness.scanner.setPhase(.active)
  await harness.scanner.accessRequest?.value
  #expect(harness.camera.requests == 1)
  #expect(harness.scanner.cameraState == .ready)
  #expect(harness.scanner.hasTorch)
  #expect(harness.scanner.isCapturing)
}

@MainActor @Test func cameraStatesMapWithoutStartingCapture() async {
  for (authorization, state) in [(CameraAuthorization.denied, ScannerViewModel.CameraState.denied), (.restricted, .restricted)] {
    let harness = Harness(authorization)
    harness.scanner.setPhase(.active)
    #expect(harness.scanner.cameraState == state)
    #expect(!harness.scanner.isCapturing)
  }
  let missing = Harness(.authorized)
  missing.camera.device = nil
  missing.scanner.setPhase(.active)
  #expect(missing.scanner.cameraState == .unavailable)
  #expect(!missing.scanner.isCapturing)

  let refused = Harness(.notDetermined)
  refused.camera.answer = .denied
  refused.scanner.setPhase(.active)
  await refused.scanner.accessRequest?.value
  #expect(refused.scanner.cameraState == .denied)
  #expect(!refused.scanner.isCapturing)
}

@MainActor @Test func acceptedScansAreRecordedAnnouncedAndFeltOnce() {
  let harness = Harness()
  harness.scanner.setPhase(.active)
  harness.show([url, secret])
  #expect(harness.repository.events.count == 2)
  #expect(harness.history.events.count == 2)
  #expect(harness.feedback.accepted == 1)
  #expect(harness.feedback.announcements.count == 2)
  #expect(harness.scanner.results.map(\.original) == [url.payload, secret.payload])
  // Still in view: nothing new.
  harness.clock.now += 0.1
  harness.scanner.receive([url, secret])
  #expect(harness.repository.events.count == 2)
  #expect(harness.feedback.accepted == 1)
}

@MainActor @Test func inactiveScenesKeepCaptureTorchAndDedupe() {
  let harness = Harness()
  harness.scanner.setPhase(.active)
  harness.scanner.torchOn = true
  harness.show([url])
  // Control Center or a notification banner.
  harness.scanner.setPhase(.inactive)
  #expect(harness.scanner.isCapturing)
  #expect(harness.scanner.torchOn)
  harness.clock.now += 0.1
  harness.scanner.receive([url])
  harness.scanner.setPhase(.active)
  harness.clock.now += 0.1
  harness.scanner.receive([url])
  #expect(harness.repository.events.count == 1)
  #expect(harness.scanner.results.count == 1)
}

@MainActor @Test func visitingHistoryStopsCaptureWithoutRecordingAVisibleCodeAgain() {
  let harness = Harness()
  harness.scanner.setPhase(.active)
  harness.show([url])
  #expect(harness.repository.events.count == 1)

  harness.scanner.showingHistory = true
  #expect(!harness.scanner.isCapturing)
  #expect(harness.scanner.highlights.isEmpty)
  #expect(harness.scanner.results.count == 1)
  // Frames are ignored while History is shown.
  harness.scanner.receive([Detection("ignored")])
  harness.clock.now += 45

  harness.scanner.showingHistory = false
  #expect(harness.scanner.isCapturing)
  harness.clock.now += 0.3
  harness.show([url])
  #expect(harness.repository.events.count == 1)
  #expect(harness.scanner.results.map(\.original) == [url.payload])

  // A code that really left and came back is a new scan.
  harness.clock.now += 3
  harness.scanner.tick()
  harness.show([url])
  #expect(harness.repository.events.count == 2)
}

@MainActor @Test func backgroundEndsTheSessionAndDropsSensitiveResults() {
  let harness = Harness()
  harness.scanner.setPhase(.active)
  harness.scanner.torchOn = true
  harness.show([url, secret])
  harness.scanner.setPhase(.inactive)
  harness.scanner.setPhase(.background)
  #expect(!harness.scanner.isCapturing)
  #expect(!harness.scanner.torchOn)
  #expect(harness.scanner.results.map(\.original) == [url.payload])
  #expect(harness.scanner.highlights.isEmpty)
  harness.scanner.setPhase(.inactive)
  harness.scanner.setPhase(.active)
  #expect(harness.scanner.isCapturing)
  #expect(harness.scanner.results.map(\.original) == [url.payload])
}

@MainActor @Test func dismissedResultsStayHiddenWhileInView() {
  let harness = Harness()
  harness.scanner.setPhase(.active)
  harness.show([url, secret])
  let first = harness.scanner.results[0]
  harness.scanner.dismiss(first)
  #expect(harness.scanner.results.map(\.original) == [secret.payload])
  harness.clock.now += 0.1
  harness.scanner.receive([url, secret])
  #expect(harness.scanner.results.map(\.original) == [secret.payload])
}

@MainActor @Test func ticksExpireHighlightsButKeepTheLastResults() {
  let harness = Harness()
  harness.scanner.setPhase(.active)
  harness.show([url])
  let published = harness.scanner.results
  harness.clock.now += 1
  harness.scanner.tick()
  #expect(harness.scanner.highlights.count == 1)
  harness.clock.now += 1
  harness.scanner.tick()
  #expect(harness.scanner.highlights.isEmpty)
  #expect(harness.scanner.results == published)
}

@MainActor @Test func simulatedScenesCanChangeAtRuntime() {
  let harness = Harness(simulatedScene: [url])
  harness.scanner.setPhase(.active)
  harness.scanner.tick()
  harness.clock.now += 0.1
  harness.scanner.tick()
  #expect(harness.repository.events.count == 1)
  harness.scanner.setSimulatedScene([])
  harness.clock.now += 2
  harness.scanner.tick()
  #expect(harness.scanner.highlights.isEmpty)
  #expect(harness.scanner.results.map(\.original) == [url.payload])
  let second = Detection("https://example.com/second")
  harness.scanner.setSimulatedScene([second])
  harness.scanner.tick()
  harness.clock.now += 0.1
  harness.scanner.tick()
  #expect(harness.scanner.results.map(\.original) == [second.payload])
  #expect(harness.repository.events.map(\.original) == [second.payload, url.payload])

  let live = Harness()
  live.scanner.setSimulatedScene([second])
  #expect(!live.scanner.usesSimulatedScene)
}

// MARK: - History

@MainActor @Test func deleteOffersUndoThatExpiresAfterFiveSeconds() async {
  let harness = Harness(events: [historyEvent("a", "2026-09-22T12:00:00.000Z"), historyEvent("b", "2026-09-21T12:00:00.000Z")])
  let history = harness.history
  let first = history.events[0]
  history.delete(first)
  #expect(history.events.map(\.id) == ["b"])
  #expect(history.pendingUndo == first)
  await settle()
  harness.clock.advance(by: 4.9)
  await settle()
  #expect(history.pendingUndo == first)
  history.undo()
  #expect(history.events.map(\.id) == ["a", "b"])
  #expect(history.pendingUndo == nil)

  history.delete(first)
  await settle()
  harness.clock.advance(by: HistoryViewModel.undoTimeout)
  await settle()
  #expect(history.pendingUndo == nil)
  history.undo()
  #expect(history.events.map(\.id) == ["b"])
}

@MainActor @Test func aNewDeleteRestartsTheUndoTimeout() async {
  let harness = Harness(events: [historyEvent("a", "2026-09-22T12:00:00.000Z"), historyEvent("b", "2026-09-21T12:00:00.000Z")])
  let history = harness.history
  let (a, b) = (history.events[0], history.events[1])
  history.delete(a)
  await settle()
  harness.clock.advance(by: 3)
  history.delete(b)
  await settle()
  harness.clock.advance(by: 3)
  await settle()
  #expect(history.pendingUndo == b)
  history.undo()
  #expect(history.events.map(\.id) == ["b"])
}

@MainActor @Test func clearEmptiesHistoryAndCancelsUndo() {
  let harness = Harness(events: [historyEvent("a", "2026-09-22T12:00:00.000Z"), historyEvent("b", "2026-09-21T12:00:00.000Z")])
  harness.history.delete(harness.history.events[0])
  harness.history.clear()
  #expect(harness.history.events.isEmpty)
  #expect(harness.repository.events.isEmpty)
  #expect(harness.history.pendingUndo == nil)
  #expect(harness.history.sections.isEmpty)
}

@MainActor @Test func failedWritesAreSurfacedAndLeaveStateUnchanged() {
  let harness = Harness(events: [historyEvent("a", "2026-09-22T12:00:00.000Z")])
  harness.repository.failWrites = true
  harness.history.delete(harness.history.events[0])
  #expect(harness.history.failure == .delete)
  #expect(harness.history.events.count == 1)
  #expect(harness.history.pendingUndo == nil)
  harness.history.failure = nil
  harness.history.clear()
  #expect(harness.history.failure == .clear)
  #expect(harness.history.events.count == 1)
  harness.history.failure = nil
  harness.scanner.setPhase(.active)
  harness.show([url])
  #expect(harness.history.failure == .save)
}

@MainActor @Test func sectionsFollowSearchAndEvents() {
  var calendar = Calendar(identifier: .gregorian)
  calendar.timeZone = TimeZone(identifier: "UTC")!
  let clock = TestClock(Date(timeIntervalSince1970: 1_790_078_400)) // 2026-09-22T12:00Z
  let repository = InMemoryHistory([
    historyEvent("today", "2026-09-22T10:00:00.000Z"),
    historyEvent("yesterday", "2026-09-21T10:00:00.000Z"),
  ])
  let history = HistoryViewModel(clock: clock, calendar: calendar, locale: Locale(identifier: "en_US"), open: { repository })
  #expect(history.sections.map(\.label) == [.today, .yesterday])
  history.query = "  yesterday "
  #expect(history.sections.map { $0.events.map(\.id) } == [["yesterday"]])
  history.query = "nothing matches"
  #expect(history.sections.isEmpty)
  history.query = ""
  #expect(history.sections.count == 2)
  // Midnight passes; labels follow after a refresh.
  clock.now = Date(timeIntervalSince1970: 1_790_078_400 + 86_400)
  history.refreshDays()
  #expect(history.sections.map(\.label) == [.yesterday, .weekday("Monday")])
}

// MARK: - Opening and retrying

@MainActor @Test func historyThatCannotOpenIsRetriedAndReportedOnce() {
  struct Locked: Error {}
  var attempts = 0
  var locked = true
  let repository = InMemoryHistory()
  let history = HistoryViewModel(clock: TestClock(), open: {
    attempts += 1
    if locked { throw Locked() }
    return repository
  })
  // Launch while locked fails quietly.
  #expect(!history.isAvailable)
  #expect(history.failure == nil)
  history.activate()
  #expect(history.failure == .open)
  history.failure = nil
  history.activate()
  #expect(history.failure == nil)
  // A scan while still unreadable is not silently dropped.
  history.record(ScanPayload("lost"), at: Date())
  #expect(history.failure == .open)
  // Protected data becomes available.
  locked = false
  #expect(history.openIfNeeded())
  #expect(history.failure == nil)
  history.record(ScanPayload("saved"), at: Date())
  #expect(repository.events.map(\.original) == ["saved"])
  #expect(attempts == 5)
}

@MainActor @Test func corruptHistoryFileIsNeverOverwrittenByScans() throws {
  let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
  defer { try? FileManager.default.removeItem(at: directory) }
  try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  let file = directory.appendingPathComponent("history-v1.json")
  let original = Data("broken history".utf8)
  try original.write(to: file)
  let history = HistoryViewModel(clock: TestClock(), open: { try HistoryStore(directory: directory) })
  history.activate()
  history.record(ScanPayload("https://example.com"), at: Date())
  history.clear()
  #expect(history.failure == .open)
  #expect(try Data(contentsOf: file) == original)
}

@Test func payloadCacheIsBoundedAndReusesParses() {
  let cache = ScanPayloadCache(capacity: 2)
  let first = cache.payload("https://example.com/1", format: .qr)
  _ = cache.payload("https://example.com/2", format: .qr)
  #expect(cache.payload("https://example.com/1", format: .qr) == first)
  _ = cache.payload("https://example.com/3", format: .qr)
  #expect(cache.count == 2)
  let ean = CodeFormat(rawValue: "VNBarcodeSymbologyEAN13")
  #expect(cache.payload("3017624010701", format: ean).kind == .product)
  #expect(cache.payload("3017624010701", format: .qr).kind == .text)
  cache.removeAll()
  #expect(cache.count == 0)
}
