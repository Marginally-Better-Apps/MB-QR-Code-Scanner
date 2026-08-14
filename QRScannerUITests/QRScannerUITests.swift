import XCTest

final class QRScannerUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launch()
    }

    func testScannerAndHistoryAreNamedAndReachable() {
        let scannerTab = app.buttons["Scanner"].firstMatch
        let historyTab = app.buttons["History"].firstMatch

        XCTAssertTrue(scannerTab.waitForExistence(timeout: 5))
        XCTAssertTrue(historyTab.exists)
        XCTAssertTrue(app.navigationBars["Scanner"].exists)

        historyTab.tap()
        XCTAssertTrue(app.navigationBars["History"].waitForExistence(timeout: 2))

        scannerTab.tap()
        XCTAssertTrue(app.navigationBars["Scanner"].waitForExistence(timeout: 2))
    }

    func testDestinationNamesAreLocalized() {
        app.terminate()
        app.launchArguments = ["-AppleLanguages", "(es)", "-AppleLocale", "es_ES"]
        app.launch()

        let scannerTab = app.buttons["Escáner"].firstMatch
        let historyTab = app.buttons["Historial"].firstMatch

        XCTAssertTrue(scannerTab.waitForExistence(timeout: 5))
        XCTAssertTrue(historyTab.exists)

        historyTab.tap()
        XCTAssertTrue(app.navigationBars["Historial"].waitForExistence(timeout: 2))
    }
}
