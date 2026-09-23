import SwiftUI
import AVFoundation
import Observation

@main
struct QRScannerApp: App {
  @State private var model = ScannerModel()
  @Environment(\.scenePhase) private var scenePhase

  var body: some Scene {
    WindowGroup {
      NavigationStack {
        ScannerScreen(model: model)
      }
      .task { await model.activate() }
      .onChange(of: scenePhase) { _, phase in
        if phase == .active { Task { await model.activate() } }
        else { model.pause() }
      }
      .alert("QR Scanner", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) {
        Button("OK", role: .cancel) { model.error = nil }
      } message: { Text(model.error ?? "") }
    }
  }
}

@MainActor @Observable
final class ScannerModel {
  enum CameraState { case requesting, ready, denied, restricted, unavailable }
  var cameraState: CameraState = .requesting
  var isCapturing = false
  @ObservationIgnored private var session = ScanSession()
  private(set) var results: [ScanPayload] = []
  private(set) var highlights: [Detection] = []
  var events: [HistoryEvent] = []
  var error: String?
  var showingHistory = false
  var pendingUndo: HistoryEvent?
  private var history: HistoryStore?
  private var timer: Task<Void, Never>?
  private var undoTimer: Task<Void, Never>?
  private var announced: Set<String> = []
  let fixtureName: String?
  let imageFixture: String?

  init() {
    #if targetEnvironment(simulator) || DEBUG
    fixtureName = UserDefaults.standard.string(forKey: "scannerFixture")
    imageFixture = UserDefaults.standard.string(forKey: "nativeImageFixture")
    #else
    fixtureName = nil
    imageFixture = nil
    #endif
    do {
      let directory = URL.documentsDirectory.appendingPathComponent("history", isDirectory: true)
      history = try HistoryStore(directory: directory)
      events = history?.events ?? []
      #if targetEnvironment(simulator) || DEBUG
      if UserDefaults.standard.string(forKey: "historyFixture") == "grouped", events.isEmpty {
        let now = Date()
        for (payload, age) in [("https://example.com/today", 0.0), ("otpauth://totp/Example?secret=JBSWY3DPEHPK3PXP", 60.0), ("WIFI:T:WPA;S:Office;P:fixture;;", 86400.0), ("https://example.com/yesterday", 86460.0), ("Older note", 259200.0), ("https://example.com/older", 345600.0)] {
          try history?.record(ScanPayload(payload), at: now.addingTimeInterval(-age))
        }
        events = history?.events ?? []
      }
      #endif
    } catch {
      self.error = NSLocalizedString("History could not be opened. Your saved file has not been changed.", comment: "")
    }
  }

  func activate() async {
    guard !showingHistory else { return }
    #if targetEnvironment(simulator) || DEBUG
    if fixtureName != nil || imageFixture != nil {
      cameraState = .ready
      start()
      return
    }
    if let fixture = UserDefaults.standard.string(forKey: "cameraFixture"), fixture != "authorized" {
      cameraState = fixture == "restricted" ? .restricted : fixture == "hardware-unavailable" ? .unavailable : .denied
      return
    }
    #endif
    var authorization = AVCaptureDevice.authorizationStatus(for: .video)
    if authorization == .notDetermined {
      _ = await AVCaptureDevice.requestAccess(for: .video)
      authorization = AVCaptureDevice.authorizationStatus(for: .video)
    }
    switch authorization {
    case .authorized:
      cameraState = AVCaptureDevice.default(for: .video) == nil ? .unavailable : .ready
    case .denied: cameraState = .denied
    case .restricted: cameraState = .restricted
    default: cameraState = .requesting
    }
    if cameraState == .ready { start() }
  }

  private func start() {
    guard !isCapturing else { return }
    isCapturing = true
    timer?.cancel()
    timer = Task { [weak self] in
      while !Task.isCancelled {
        guard let self else { return }
        if let fixtureName = self.fixtureName {
          self.receive(Self.fixture(fixtureName))
        } else {
          self.session.expire(at: Date())
          self.publishSession()
        }
        try? await Task.sleep(for: .milliseconds(100))
      }
    }
  }

  func pause() {
    isCapturing = false
    timer?.cancel()
    timer = nil
    session.pause()
    publishSession()
    announced.removeAll()
  }

  func receive(_ observations: [Detection]) {
    guard isCapturing, !showingHistory else { return }
    let now = Date()
    let accepted = session.receive(observations, at: now)
    publishSession()
    for payload in accepted {
      let parsed = ScanPayload(payload)
      do {
        try history?.record(parsed, at: now)
        events = history?.events ?? events
      } catch {
        self.error = NSLocalizedString("This scan could not be saved.", comment: "")
      }
      if announced.insert(Detection(payload).id).inserted {
        UIAccessibility.post(notification: .announcement, argument: parsed.title)
      }
    }
    if !accepted.isEmpty { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
  }

  func dismiss(_ payload: ScanPayload) {
    session.dismiss(payload.original)
    publishSession()
  }

  private func publishSession() {
    // Camera bookkeeping must not rebuild an open native menu every frame.
    let nextResults = session.results.map { ScanPayload($0.payload) }
    if results != nextResults { results = nextResults }
    if highlights != session.highlights { highlights = session.highlights }
  }

  func delete(_ event: HistoryEvent) {
    do {
      try history?.delete(id: event.id)
      events = history?.events ?? events.filter { $0.id != event.id }
      pendingUndo = event
      undoTimer?.cancel()
      undoTimer = Task { [weak self] in
        try? await Task.sleep(for: .seconds(5))
        guard !Task.isCancelled else { return }
        self?.pendingUndo = nil
      }
    } catch { self.error = NSLocalizedString("The scan could not be deleted.", comment: "") }
  }

  func undo() {
    guard let event = pendingUndo else { return }
    do {
      try history?.restore(event)
      events = history?.events ?? (events + [event]).sorted { $0.date > $1.date }
      undoTimer?.cancel()
      pendingUndo = nil
    } catch { self.error = NSLocalizedString("The scan could not be restored.", comment: "") }
  }

  func clear() {
    do {
      try history?.clear()
      events = []
      undoTimer?.cancel()
      pendingUndo = nil
    } catch { self.error = NSLocalizedString("History could not be cleared.", comment: "") }
  }

  private static func fixture(_ name: String) -> [Detection] {
    let bounds = CGRect(x: 0.2, y: 0.3, width: 0.4, height: 0.2)
    switch name {
    case "three-codes":
      return [Detection("https://example.com/three-top", bounds: CGRect(x: 0.1, y: 0.15, width: 0.25, height: 0.12)), Detection("Hello middle code", bounds: CGRect(x: 0.55, y: 0.3, width: 0.25, height: 0.12)), Detection("myapp://pay?amount=10", bounds: CGRect(x: 0.2, y: 0.48, width: 0.25, height: 0.12))]
    case "two-codes": return [Detection("https://example.com/left", bounds: bounds), Detection("Hello from the right code", bounds: CGRect(x: 0.6, y: 0.3, width: 0.25, height: 0.15))]
    default: return [Detection("https://example.com/fixture", bounds: bounds)]
    }
  }
}
