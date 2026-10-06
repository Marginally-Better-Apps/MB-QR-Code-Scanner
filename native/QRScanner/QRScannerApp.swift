import SwiftUI

@main
struct QRScannerApp: App {
  @State private var scanner = AppEnvironment.makeScanner()
  @Environment(\.scenePhase) private var scenePhase

  var body: some Scene {
    WindowGroup {
      NavigationStack {
        ScannerScreen(model: scanner)
      }
      .toastHost()
      .onChange(of: scenePhase, initial: true) { _, phase in scanner.setPhase(AppPhase(phase)) }
      // History opened while the device was locked becomes readable after unlock.
      .onReceive(NotificationCenter.default.publisher(for: UIApplication.protectedDataDidBecomeAvailableNotification)) { _ in
        scanner.history.openIfNeeded()
      }
      .onReceive(NotificationCenter.default.publisher(for: UIApplication.significantTimeChangeNotification)) { _ in
        scanner.history.refreshDays()
      }
      .historyFailureAlert(scanner.history)
    }
  }
}

private extension AppPhase {
  init(_ phase: ScenePhase) {
    switch phase {
    case .active: self = .active
    case .background: self = .background
    default: self = .inactive
    }
  }
}
