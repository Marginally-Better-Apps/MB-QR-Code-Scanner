import XCTest
@testable import QRScanner

@MainActor
final class QRScannerTests: XCTestCase {
    func testColdLaunchSelectsScanner() {
        let appState = AppState()

        XCTAssertEqual(appState.selectedTab, .scanner)
    }

    func testSwitchingTabsPreservesScannerSession() {
        let appState = AppState()
        let originalSession = appState.scannerSession

        appState.selectedTab = .history
        XCTAssertTrue(appState.scannerSession === originalSession)

        appState.selectedTab = .scanner
        XCTAssertTrue(appState.scannerSession === originalSession)
    }
}
