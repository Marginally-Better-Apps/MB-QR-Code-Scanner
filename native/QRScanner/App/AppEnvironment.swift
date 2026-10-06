import Foundation

/// Composition root: builds the view models with system services or launch fixtures.
@MainActor
enum AppEnvironment {
  static let historyDirectory = URL.documentsDirectory.appendingPathComponent("history", isDirectory: true)

  static func makeScanner() -> ScannerViewModel {
    let history = HistoryViewModel(searchText: { HistoryRowPresentation($0).searchText }, open: openHistory)
    #if DEBUG || targetEnvironment(simulator)
    return ScannerViewModel(camera: LaunchFixtures.camera ?? SystemCameraAuthorizer(), history: history,
      feedback: SystemScanFeedback(), simulatedScene: LaunchFixtures.simulatedScene, imageFixture: LaunchFixtures.imageFixture,
      location: LaunchFixtures.location ?? SystemScanLocation())
    #else
    return ScannerViewModel(camera: SystemCameraAuthorizer(), history: history, feedback: SystemScanFeedback(), location: SystemScanLocation())
    #endif
  }

  private static func openHistory() throws -> HistoryRepository {
    let store = try HistoryStore(directory: historyDirectory)
    #if DEBUG || targetEnvironment(simulator)
    try LaunchFixtures.seedHistoryIfRequested(store)
    #endif
    return store
  }
}
