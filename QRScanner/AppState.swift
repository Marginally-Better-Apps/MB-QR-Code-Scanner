import SwiftUI

enum AppTab: Hashable {
    case scanner
    case history
}

@MainActor
final class ScannerSessionStore: ObservableObject {}

@MainActor
final class AppState: ObservableObject {
    @Published var selectedTab: AppTab
    let scannerSession: ScannerSessionStore

    init(
        selectedTab: AppTab = .scanner,
        scannerSession: ScannerSessionStore? = nil
    ) {
        self.selectedTab = selectedTab
        self.scannerSession = scannerSession ?? ScannerSessionStore()
    }
}
