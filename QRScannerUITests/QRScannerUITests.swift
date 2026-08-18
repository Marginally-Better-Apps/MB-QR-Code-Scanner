import XCTest

final class QRScannerUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    private func launch(
        cameraFixture: String = "authorized",
        scannerFixture: String? = nil
    ) {
        app = XCUIApplication()
        app.launchArguments = ["--camera-fixture", cameraFixture]
        if let scannerFixture {
            app.launchArguments += ["--scanner-fixture", scannerFixture]
        }
        app.launch()
    }

    func testNamedScannerFixtureDisplaysObservedPayload() {
        launch(scannerFixture: "single-code")

        XCTAssertTrue(app.staticTexts["Observed QR Code"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["https://example.com/fixture"].exists)
        XCTAssertEqual(app.staticTexts.matching(identifier: "scanner-observation-payload").count, 1)
    }

    func testScannerAndHistoryAreNamedAndReachable() {
        launch()

        let scannerTab = app.buttons["Scanner"].firstMatch
        let historyTab = app.buttons["History"].firstMatch

        XCTAssertTrue(scannerTab.waitForExistence(timeout: 5))
        XCTAssertTrue(historyTab.exists)
        XCTAssertFalse(app.navigationBars["Scanner"].exists)
        XCTAssertEqual(app.navigationBars.count, 0)

        historyTab.tap()
        XCTAssertTrue(app.staticTexts["Your scan history will appear here."].waitForExistence(timeout: 2))
        XCTAssertFalse(app.navigationBars["History"].exists)
        XCTAssertEqual(app.navigationBars.count, 0)

        scannerTab.tap()
        XCTAssertTrue(scannerTab.waitForExistence(timeout: 2))
        XCTAssertFalse(app.navigationBars["Scanner"].exists)
        XCTAssertEqual(app.navigationBars.count, 0)
    }

    func testDestinationNamesAreLocalized() {
        app = XCUIApplication()
        app.launchArguments = [
            "--camera-fixture", "authorized",
            "-AppleLanguages", "(es)",
            "-AppleLocale", "es_ES"
        ]
        app.launch()

        let scannerTab = app.buttons["Escáner"].firstMatch
        let historyTab = app.buttons["Historial"].firstMatch

        XCTAssertTrue(scannerTab.waitForExistence(timeout: 5))
        XCTAssertTrue(historyTab.exists)

        historyTab.tap()
        XCTAssertTrue(
            app.staticTexts["Tu historial de escaneos aparecerá aquí."].waitForExistence(timeout: 2)
        )
        XCTAssertFalse(app.navigationBars["Historial"].exists)
        XCTAssertEqual(app.navigationBars.count, 0)
    }

    func testCameraUnavailableStateIsLocalized() {
        app = XCUIApplication()
        app.launchArguments = [
            "--camera-fixture", "restricted",
            "-AppleLanguages", "(es)",
            "-AppleLocale", "es_ES"
        ]
        app.launch()

        XCTAssertTrue(
            app.staticTexts["El acceso a la cámara está restringido"].waitForExistence(timeout: 5)
        )
        XCTAssertTrue(
            app.staticTexts[
                "El acceso a la cámara está restringido por Tiempo en pantalla o la gestión del dispositivo."
            ].exists
        )
    }

    func testFirstRunRequestsCameraAccessInScannerContext() {
        launch(cameraFixture: "not-determined")

        XCTAssertTrue(app.staticTexts["Camera Access"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.navigationBars["Scanner"].exists)
        XCTAssertEqual(app.navigationBars.count, 0)
        XCTAssertTrue(
            app.staticTexts[
                "QR Scanner recognizes QR codes on this device. Camera frames are never uploaded or saved."
            ].exists
        )
        XCTAssertEqual(app.pageIndicators.count, 0)
        XCTAssertEqual(app.buttons.matching(identifier: "camera-primary-action").count, 0)
    }

    func testDeniedAccessOffersSettingsWithoutADeadScanControl() {
        launch(cameraFixture: "denied")

        XCTAssertTrue(app.staticTexts["Camera Access Is Off"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Allow camera access in Settings to scan QR codes."].exists)
        XCTAssertTrue(app.buttons["Open Settings"].exists)
        XCTAssertEqual(app.buttons.matching(identifier: "camera-primary-action").count, 1)
        XCTAssertFalse(app.buttons["Scan"].exists)
    }

    func testRestrictedAndHardwareUnavailableStatesUseAccurateLanguageAndNoControls() {
        launch(cameraFixture: "restricted")

        XCTAssertTrue(app.staticTexts["Camera Access Is Restricted"].waitForExistence(timeout: 5))
        XCTAssertTrue(
            app.staticTexts["Camera access is restricted by Screen Time or device management."].exists
        )
        XCTAssertEqual(app.buttons.matching(identifier: "camera-primary-action").count, 0)

        app.terminate()
        launch(cameraFixture: "hardware-unavailable")

        XCTAssertTrue(app.staticTexts["Camera Unavailable"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["No camera is available on this device."].exists)
        XCTAssertEqual(app.buttons.matching(identifier: "camera-primary-action").count, 0)
    }

    func testReturningFromSettingsRecoversAndActivatesCamera() {
        launch(cameraFixture: "recovering")

        let settingsButton = app.buttons["Open Settings"]
        XCTAssertTrue(settingsButton.waitForExistence(timeout: 5))
        settingsButton.tap()

        app.activate()

        XCTAssertTrue(app.staticTexts["Ready to Scan"].waitForExistence(timeout: 5))
        XCTAssertTrue(
            app.staticTexts["Point the camera at a QR code. Scanning starts automatically."].exists
        )
        XCTAssertFalse(app.buttons["Scan"].exists)
        XCTAssertFalse(app.navigationBars["Scanner"].exists)
        XCTAssertEqual(app.navigationBars.count, 0)
    }
}
