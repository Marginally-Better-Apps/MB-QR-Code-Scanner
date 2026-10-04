import Foundation
import Observation

/// Scanner state: camera access, capture lifecycle, live results, and navigation to History.
///
/// Capture runs only while the scene is active and History is not shown. That is decided in one
/// place, `updateCapture()`, which every input (scene phase, navigation, permission) funnels into.
@MainActor @Observable
final class ScannerViewModel {
  enum CameraState: Equatable { case requesting, ready, denied, restricted, unavailable }
  /// Bookkeeping cadence while capturing. Expires highlights when frames stop arriving.
  static let tickInterval: TimeInterval = 0.1

  private(set) var cameraState: CameraState = .requesting
  private(set) var hasTorch = false
  var torchOn = false
  /// Drives the camera preview. False while History is shown or the app is in the background.
  private(set) var isCapturing = false
  private(set) var results: [ScanPayload] = []
  private(set) var highlights: [Detection] = []
  private(set) var phase: AppPhase = .inactive
  /// Deterministic detections that replace the camera for UI tests. `nil` in normal use.
  private(set) var simulatedScene: [Detection]?
  /// A bundled image decoded through the real preview pipeline, for UI tests.
  let imageFixture: String?
  let history: HistoryViewModel

  /// Navigation state. Showing History stops capture but keeps results and dedupe state.
  var showingHistory: Bool {
    get { historyShown }
    set {
      guard historyShown != newValue else { return }
      historyShown = newValue
      updateCapture()
    }
  }

  var usesSimulatedScene: Bool { simulatedScene != nil }

  private var historyShown = false
  @ObservationIgnored private var session: ScanSession
  @ObservationIgnored private let camera: CameraAuthorizing
  @ObservationIgnored private let feedback: ScanFeedback
  @ObservationIgnored private let clock: ScannerClock
  @ObservationIgnored private let payloads = ScanPayloadCache(capacity: 64)
  @ObservationIgnored private var publishedKeys: [String] = []
  @ObservationIgnored private var announced: Set<String> = []
  @ObservationIgnored private var ticker: Task<Void, Never>?
  @ObservationIgnored private(set) var accessRequest: Task<Void, Never>?

  init(camera: CameraAuthorizing, history: HistoryViewModel, feedback: ScanFeedback, clock: ScannerClock = SystemClock(),
       timing: ScanSession.Timing = .standard, simulatedScene: [Detection]? = nil, imageFixture: String? = nil) {
    self.camera = camera
    self.history = history
    self.feedback = feedback
    self.clock = clock
    self.simulatedScene = simulatedScene
    self.imageFixture = imageFixture
    session = ScanSession(timing: timing)
  }

  /// The single activation path for scene changes.
  func setPhase(_ next: AppPhase) {
    guard next != phase else { return }
    phase = next
    switch next {
    case .active: history.activate()
    case .background: endSession()
    case .inactive: break // Control Center, banners, and the permission prompt keep the session.
    }
    updateCapture()
  }

  func receive(_ observations: [Detection]) {
    guard isCapturing else { return }
    let now = clock.now
    let accepted = session.receive(observations, at: now)
    publishSession()
    guard !accepted.isEmpty else { return }
    for detection in accepted {
      let parsed = payloads.payload(for: detection)
      history.record(parsed, at: now)
      if announced.insert(detection.id).inserted { feedback.announce(parsed.title) }
    }
    feedback.scanAccepted()
  }

  func dismiss(_ payload: ScanPayload) {
    session.dismiss(payload.original, format: payload.format)
    publishSession()
  }

  /// Replaces the simulated scene. Ignored for live capture.
  func setSimulatedScene(_ detections: [Detection]) {
    guard simulatedScene != nil else { return }
    simulatedScene = detections
  }

  /// One bookkeeping step. Runs on `tickInterval` while capturing.
  func tick() {
    guard isCapturing else { return }
    if let simulatedScene {
      receive(simulatedScene)
    } else {
      session.expire(at: clock.now)
      publishSession()
    }
  }

  // MARK: - Capture lifecycle

  private var wantsCapture: Bool { phase == .active && !historyShown }

  private func updateCapture() {
    guard wantsCapture else { return stopCapture() }
    let authorization = camera.authorization
    if authorization == .notDetermined {
      cameraState = .requesting
      guard accessRequest == nil else { return }
      accessRequest = Task { [weak self] in
        guard let self else { return }
        let granted = await self.camera.requestAccess()
        self.accessRequest = nil
        self.apply(granted)
        if self.wantsCapture, self.cameraState == .ready { self.startCapture() }
      }
      return
    }
    apply(authorization)
    if cameraState == .ready { startCapture() } else { stopCapture() }
  }

  private func apply(_ authorization: CameraAuthorization) {
    switch authorization {
    case .authorized:
      let capabilities = camera.capabilities()
      cameraState = capabilities == nil ? .unavailable : .ready
      hasTorch = capabilities?.hasTorch ?? false
    case .denied: cameraState = .denied
    case .restricted: cameraState = .restricted
    case .notDetermined: cameraState = .requesting
    }
    if cameraState != .ready { torchOn = false }
  }

  private func startCapture() {
    guard !isCapturing else { return }
    isCapturing = true
    session.resume(at: clock.now)
    ticker?.cancel()
    ticker = Task { [weak self] in
      while !Task.isCancelled {
        guard let self else { return }
        self.tick()
        do { try await self.clock.sleep(for: Self.tickInterval) } catch { return }
      }
    }
  }

  /// Stops frames without forgetting what is on screen. The torch resumes with capture.
  private func stopCapture() {
    ticker?.cancel()
    ticker = nil
    guard isCapturing else { return }
    isCapturing = false
    session.suspend(at: clock.now)
    publishSession()
  }

  /// Leaving the foreground ends the session: sensitive results and parsed secrets are discarded.
  private func endSession() {
    stopCapture()
    torchOn = false
    session.pause()
    payloads.removeAll()
    announced.removeAll()
    publishSession()
  }

  /// Camera bookkeeping must not rebuild an open native menu every frame, so results are only
  /// republished when the set of codes changes, and each code is parsed once.
  private func publishSession() {
    let keys = session.results.map { $0.format.rawValue + "\u{1F}" + $0.payload }
    if keys != publishedKeys {
      publishedKeys = keys
      let next = session.results.map(payloads.payload(for:))
      if results != next { results = next }
    }
    if highlights != session.highlights { highlights = session.highlights }
  }
}
