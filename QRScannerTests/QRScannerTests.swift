import AVFoundation
import Vision
import XCTest
@testable import QRScanner

@MainActor
final class QRScannerTests: XCTestCase {
    func testFixtureSourceEmitsEngineNeutralObservationUsingInjectedClock() {
        let timestamp = Date(timeIntervalSince1970: 1_728_000_000)
        let clock = TestScannerClock(now: timestamp)
        let source = ScannerObservationFixtureSource(
            engineID: ScannerEngineID("fixture.unit"),
            clock: clock
        )
        var receivedFrames: [[ScannerObservation]] = []

        source.start { receivedFrames.append($0) }
        source.emit([
            ScannerFixtureDetection(
                rawPayload: "https://example.com/one",
                displayBounds: CGRect(x: 0.1, y: 0.2, width: 0.3, height: 0.4)
            )
        ])

        XCTAssertEqual(
            receivedFrames,
            [[
                ScannerObservation(
                    rawPayload: "https://example.com/one",
                    displayBounds: CGRect(x: 0.1, y: 0.2, width: 0.3, height: 0.4),
                    timestamp: timestamp,
                    engineID: ScannerEngineID("fixture.unit")
                )
            ]]
        )
    }

    func testScannerSessionConsumesObservationProtocolFrames() async {
        let source = ScannerObservationFixtureSource(
            engineID: ScannerEngineID("fixture.session"),
            clock: TestScannerClock(now: Date(timeIntervalSince1970: 1_728_000_100))
        )
        let session = ScannerSessionStore(
            cameraAccess: CameraAccessStub(authorization: .authorized),
            observationSource: source
        )

        await session.activateScanner()
        source.emit([
            ScannerFixtureDetection(
                rawPayload: "replacement",
                displayBounds: CGRect(x: 0.4, y: 0.3, width: 0.2, height: 0.2)
            )
        ])

        XCTAssertEqual(session.visibleObservations.map(\.rawPayload), ["replacement"])

        source.emit([])

        XCTAssertTrue(session.visibleObservations.isEmpty)
    }

    func testNamedLaunchFixtureEmitsItsDeterministicObservation() {
        let timestamp = Date(timeIntervalSince1970: 1_728_000_200)
        let source = ScannerObservationSourceFactory.make(
            arguments: ["QRScanner", "--scanner-fixture", "single-code"],
            fixturesEnabled: true,
            clock: TestScannerClock(now: timestamp)
        )
        var receivedFrames: [[ScannerObservation]] = []

        source.start { receivedFrames.append($0) }

        XCTAssertEqual(source.engineID, ScannerEngineID("fixture.single-code"))
        XCTAssertEqual(receivedFrames.count, 1)
        XCTAssertEqual(receivedFrames[0].map(\.rawPayload), ["https://example.com/fixture"])
        XCTAssertEqual(receivedFrames[0].map(\.timestamp), [timestamp])
    }

    func testFixtureSourceDeterministicallyEmitsLossRepeatReplacementAndSimultaneousCodes() {
        let clock = TestScannerClock(now: Date(timeIntervalSince1970: 10))
        let engineID = ScannerEngineID("fixture.sequence")
        let source = ScannerObservationFixtureSource(engineID: engineID, clock: clock)
        var receivedFrames: [[ScannerObservation]] = []
        source.start { receivedFrames.append($0) }

        source.emit([detection("first")])
        clock.now = Date(timeIntervalSince1970: 11)
        source.emit([])
        clock.now = Date(timeIntervalSince1970: 12)
        source.emit([detection("first")])
        clock.now = Date(timeIntervalSince1970: 13)
        source.emit([detection("replacement")])
        clock.now = Date(timeIntervalSince1970: 14)
        source.emit([detection("left"), detection("right")])

        XCTAssertEqual(
            receivedFrames.map { $0.map(\.rawPayload) },
            [["first"], [], ["first"], ["replacement"], ["left", "right"]]
        )
        XCTAssertEqual(
            receivedFrames.flatMap { $0 }.map(\.timestamp),
            [10, 12, 13, 14, 14].map(Date.init(timeIntervalSince1970:))
        )
        XCTAssertTrue(receivedFrames.flatMap { $0 }.allSatisfy { $0.engineID == engineID })
    }

    func testFixtureModeIsIgnoredWhenBuildDoesNotAllowFixtures() {
        let defaults = UserDefaults(suiteName: #function)!
        defaults.set("single-code", forKey: "scannerFixture")
        defer { defaults.removePersistentDomain(forName: #function) }

        let source = ScannerObservationSourceFactory.make(
            arguments: ["QRScanner", "--scanner-fixture", "single-code"],
            defaults: defaults,
            fixturesEnabled: false,
            dataScannerSupported: true
        )
        var receivedFrames: [[ScannerObservation]] = []
        source.start { receivedFrames.append($0) }

        XCTAssertEqual(source.engineID, ScannerEngineID("visionkit"))
        XCTAssertTrue(receivedFrames.isEmpty)
    }

    func testCameraPurposeStringPromisesOnDeviceRecognitionWithoutRetention() {
        XCTAssertEqual(
            Bundle.main.object(forInfoDictionaryKey: "NSCameraUsageDescription") as? String,
            "QR Scanner recognizes QR codes on this device. Camera frames are never uploaded or saved."
        )
    }

    func testInfoPlistDoesNotOptOutOfSystemLiquidGlass() {
        let compatibilityMode = Bundle.main.object(
            forInfoDictionaryKey: "UIDesignRequiresCompatibility"
        ) as? Bool

        XCTAssertNotEqual(compatibilityMode, true)
    }

    func testCameraPurposeStringIsLocalizedInSpanish() throws {
        let url = try XCTUnwrap(
            Bundle.main.url(
                forResource: "InfoPlist",
                withExtension: "strings",
                subdirectory: nil,
                localization: "es"
            )
        )
        let strings = try XCTUnwrap(NSDictionary(contentsOf: url) as? [String: String])

        XCTAssertEqual(
            strings["NSCameraUsageDescription"],
            "QR Scanner reconoce códigos QR en este dispositivo. Los fotogramas de la cámara nunca se suben ni se guardan."
        )
    }

    func testCameraAccessStateMapsEveryAuthorizationAndHardwareState() {
        XCTAssertEqual(
            CameraAccessState.resolve(authorization: .notDetermined, cameraAvailable: true),
            .notDetermined
        )
        XCTAssertEqual(
            CameraAccessState.resolve(authorization: .authorized, cameraAvailable: true),
            .ready
        )
        XCTAssertEqual(
            CameraAccessState.resolve(authorization: .denied, cameraAvailable: true),
            .denied
        )
        XCTAssertEqual(
            CameraAccessState.resolve(authorization: .restricted, cameraAvailable: true),
            .restricted
        )

        for authorization in CameraAuthorization.allCases {
            XCTAssertEqual(
                CameraAccessState.resolve(authorization: authorization, cameraAvailable: false),
                .hardwareUnavailable
            )
        }
    }

    func testActivatingScannerRequestsUndeterminedAuthorizationInScannerContext() async {
        let cameraAccess = CameraAccessStub(
            authorization: .notDetermined,
            authorizationAfterRequest: .authorized
        )
        let session = ScannerSessionStore(cameraAccess: cameraAccess)

        XCTAssertEqual(session.cameraAccessState, .notDetermined)

        await session.activateScanner()

        XCTAssertEqual(cameraAccess.requestCount, 1)
        XCTAssertEqual(session.cameraAccessState, .ready)
        XCTAssertTrue(session.isCameraActive)
    }

    func testReturningFromSettingsRechecksAccessAndActivatesCamera() {
        let cameraAccess = CameraAccessStub(authorization: .denied)
        let session = ScannerSessionStore(cameraAccess: cameraAccess)

        XCTAssertEqual(session.cameraAccessState, .denied)
        XCTAssertFalse(session.isCameraActive)

        cameraAccess.authorization = .authorized
        session.resumeFromSettings()

        XCTAssertEqual(session.cameraAccessState, .ready)
        XCTAssertTrue(session.isCameraActive)
    }

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

    func testFactorySelectsVisionKitEngineWhenNoFixtureIsRequested() {
        let source = ScannerObservationSourceFactory.make(
            arguments: ["QRScanner"],
            fixturesEnabled: true,
            dataScannerSupported: true
        )

        XCTAssertEqual(source.engineID, ScannerEngineID("visionkit"))
    }

    func testEngineSelectionUsesFallbackOnlyWhenDataScannerHardwareIsUnsupported() {
        let supportedAvailable = ScannerEngineSelector.decide(
            dataScannerSupported: true,
            dataScannerAvailable: true,
            authorization: .authorized
        )
        let supportedUnavailable = ScannerEngineSelector.decide(
            dataScannerSupported: true,
            dataScannerAvailable: false,
            authorization: .authorized
        )
        let unsupported = ScannerEngineSelector.decide(
            dataScannerSupported: false,
            dataScannerAvailable: false,
            authorization: .authorized
        )
        let deniedFallback = ScannerEngineSelector.decide(
            dataScannerSupported: false,
            dataScannerAvailable: false,
            authorization: .denied
        )
        let restrictedFallback = ScannerEngineSelector.decide(
            dataScannerSupported: false,
            dataScannerAvailable: false,
            authorization: .restricted
        )
        let deniedPrimary = ScannerEngineSelector.decide(
            dataScannerSupported: true,
            dataScannerAvailable: true,
            authorization: .denied
        )

        XCTAssertEqual(
            supportedAvailable,
            ScannerEngineDecision(engine: .visionKit, startsCapture: true)
        )
        XCTAssertEqual(
            supportedUnavailable,
            ScannerEngineDecision(engine: .visionKit, startsCapture: false)
        )
        XCTAssertEqual(
            unsupported,
            ScannerEngineDecision(engine: .avFoundation, startsCapture: true)
        )
        XCTAssertEqual(
            deniedFallback,
            ScannerEngineDecision(engine: .avFoundation, startsCapture: false)
        )
        XCTAssertEqual(
            restrictedFallback,
            ScannerEngineDecision(engine: .avFoundation, startsCapture: false)
        )
        XCTAssertEqual(
            deniedPrimary,
            ScannerEngineDecision(engine: .visionKit, startsCapture: false)
        )
    }

    func testFactorySelectsAVFoundationFallbackWhenDataScannerIsUnsupported() {
        let source = ScannerObservationSourceFactory.make(
            arguments: ["QRScanner"],
            fixturesEnabled: true,
            dataScannerSupported: false
        )

        XCTAssertEqual(source.engineID, ScannerEngineID("avfoundation"))
    }

    func testVisionKitEngineDoesNotConstructControllerUntilSupportedAndAvailable() {
        let unavailable = VisionKitScannerPlatformStub(isSupported: true, isAvailable: false)
        let unsupported = VisionKitScannerPlatformStub(isSupported: false, isAvailable: true)
        let available = VisionKitScannerPlatformStub(isSupported: true, isAvailable: true)

        VisionKitScannerObservationSource(platform: unavailable, clock: TestScannerClock(now: .distantPast))
            .start { _ in }
        VisionKitScannerObservationSource(platform: unsupported, clock: TestScannerClock(now: .distantPast))
            .start { _ in }

        XCTAssertEqual(unavailable.makeControllerCount, 0)
        XCTAssertEqual(unsupported.makeControllerCount, 0)
        XCTAssertEqual(unavailable.startScanningCount, 0)
        XCTAssertEqual(unsupported.startScanningCount, 0)

        VisionKitScannerObservationSource(platform: available, clock: TestScannerClock(now: .distantPast))
            .start { _ in }

        XCTAssertEqual(available.makeControllerCount, 1)
        XCTAssertEqual(available.startScanningCount, 1)
    }

    func testVisionKitEngineRequestsQROnlyMultipleItemsAndProductOwnedFeedback() {
        let platform = VisionKitScannerPlatformStub(isSupported: true, isAvailable: true)
        let source = VisionKitScannerObservationSource(
            platform: platform,
            clock: TestScannerClock(now: .distantPast)
        )

        source.start { _ in }

        XCTAssertEqual(
            platform.lastConfiguration,
            VisionKitScannerConfiguration(
                barcodeSymbologies: [VNBarcodeSymbology.qr.rawValue],
                recognizesMultipleItems: true,
                isHighFrameRateTrackingEnabled: true,
                isGuidanceEnabled: false,
                isHighlightingEnabled: false,
                recognitionRegion: ScannerRecognitionRegion.fullPreview
            )
        )
    }

    func testVisionKitEngineTranslatesAddUpdateAndRemoveIntoNormalizedObservations() {
        let timestamp = Date(timeIntervalSince1970: 1_728_000_300)
        let platform = VisionKitScannerPlatformStub(isSupported: true, isAvailable: true)
        platform.viewSize = CGSize(width: 100, height: 200)
        let source = VisionKitScannerObservationSource(
            platform: platform,
            clock: TestScannerClock(now: timestamp)
        )
        var receivedFrames: [[ScannerObservation]] = []
        source.start { receivedFrames.append($0) }

        let first = VisionKitRecognizedBarcode(
            payload: "https://example.com/one",
            bounds: CGRect(x: 10, y: 40, width: 50, height: 20)
        )
        let second = VisionKitRecognizedBarcode(
            payload: "https://example.com/two",
            bounds: CGRect(x: 20, y: 80, width: 40, height: 40)
        )
        let missingPayload = VisionKitRecognizedBarcode(
            payload: nil,
            bounds: CGRect(x: 0, y: 0, width: 10, height: 10)
        )

        platform.eventSink?.visionKitScannerDidAdd([first], allItems: [first, missingPayload])
        platform.eventSink?.visionKitScannerDidUpdate([first], allItems: [first, second])
        platform.eventSink?.visionKitScannerDidRemove([first], allItems: [second])
        platform.eventSink?.visionKitScannerDidRemove([second], allItems: [])

        XCTAssertEqual(receivedFrames.map { $0.map(\.rawPayload) }, [
            ["https://example.com/one"],
            ["https://example.com/one", "https://example.com/two"],
            ["https://example.com/two"],
            []
        ])
        XCTAssertEqual(
            receivedFrames[0][0].displayBounds,
            CGRect(x: 0.1, y: 0.2, width: 0.5, height: 0.1)
        )
        XCTAssertEqual(
            receivedFrames[1][1].displayBounds,
            CGRect(x: 0.2, y: 0.4, width: 0.4, height: 0.2)
        )
        XCTAssertTrue(receivedFrames.flatMap { $0 }.allSatisfy { $0.engineID == source.engineID })
        XCTAssertTrue(receivedFrames.flatMap { $0 }.allSatisfy { $0.timestamp == timestamp })
    }

    func testVisionKitEngineStartStopAndSceneTransitionsAreIdempotent() {
        let platform = VisionKitScannerPlatformStub(isSupported: true, isAvailable: true)
        let source = VisionKitScannerObservationSource(
            platform: platform,
            clock: TestScannerClock(now: Date(timeIntervalSince1970: 20))
        )
        var receivedFrames: [[ScannerObservation]] = []
        source.start { receivedFrames.append($0) }
        source.start { receivedFrames.append($0) }

        XCTAssertEqual(platform.makeControllerCount, 1)
        XCTAssertEqual(platform.startScanningCount, 1)

        platform.eventSink?.visionKitScannerDidAdd(
            [VisionKitRecognizedBarcode(payload: "once", bounds: CGRect(x: 0, y: 0, width: 10, height: 10))],
            allItems: [VisionKitRecognizedBarcode(payload: "once", bounds: CGRect(x: 0, y: 0, width: 10, height: 10))]
        )
        XCTAssertEqual(receivedFrames.count, 1)

        source.handleLifecycle(.background)
        source.handleLifecycle(.background)
        XCTAssertEqual(platform.stopScanningCount, 1)
        XCTAssertEqual(platform.startScanningCount, 1)

        platform.eventSink?.visionKitScannerDidUpdate(
            [VisionKitRecognizedBarcode(payload: "ignored", bounds: CGRect(x: 0, y: 0, width: 10, height: 10))],
            allItems: [VisionKitRecognizedBarcode(payload: "ignored", bounds: CGRect(x: 0, y: 0, width: 10, height: 10))]
        )
        XCTAssertEqual(receivedFrames.count, 1)

        source.handleLifecycle(.active)
        source.handleLifecycle(.active)
        XCTAssertEqual(platform.startScanningCount, 2)
        XCTAssertEqual(platform.makeControllerCount, 1)
        XCTAssertEqual(receivedFrames.count, 1)

        source.stop()
        source.stop()
        XCTAssertEqual(platform.stopScanningCount, 2)

        platform.eventSink?.visionKitScannerDidAdd(
            [VisionKitRecognizedBarcode(payload: "after-stop", bounds: CGRect(x: 0, y: 0, width: 10, height: 10))],
            allItems: [VisionKitRecognizedBarcode(payload: "after-stop", bounds: CGRect(x: 0, y: 0, width: 10, height: 10))]
        )
        XCTAssertEqual(receivedFrames.count, 1)
    }

    func testScannerSessionStopsAndRestartsTheEngineAcrossSceneTransitions() async {
        let platform = VisionKitScannerPlatformStub(isSupported: true, isAvailable: true)
        let source = VisionKitScannerObservationSource(
            platform: platform,
            clock: TestScannerClock(now: Date(timeIntervalSince1970: 30))
        )
        let session = ScannerSessionStore(
            cameraAccess: CameraAccessStub(authorization: .authorized),
            observationSource: source
        )

        await session.activateScanner()
        XCTAssertEqual(platform.startScanningCount, 1)

        session.handleLifecycle(.background)
        XCTAssertEqual(platform.stopScanningCount, 1)
        XCTAssertEqual(platform.startScanningCount, 1)

        session.handleLifecycle(.active)
        XCTAssertEqual(platform.startScanningCount, 2)
        XCTAssertEqual(platform.makeControllerCount, 1)
    }

    func testAVFoundationEngineRequestsQROnlyMetadataAndCanReportMultipleCodes() {
        let timestamp = Date(timeIntervalSince1970: 1_728_000_400)
        let platform = AVFoundationScannerPlatformStub(isAuthorized: true)
        platform.viewSize = CGSize(width: 100, height: 200)
        let source = AVFoundationScannerObservationSource(
            platform: platform,
            clock: TestScannerClock(now: timestamp)
        )
        var receivedFrames: [[ScannerObservation]] = []
        source.start { receivedFrames.append($0) }

        XCTAssertEqual(platform.lastMetadataObjectTypes, ["org.iso.QRCode"])
        XCTAssertEqual(source.engineID, ScannerEngineID("avfoundation"))

        let first = AVFoundationRecognizedBarcode(
            payload: "https://example.com/one",
            bounds: CGRect(x: 10, y: 40, width: 50, height: 20)
        )
        let second = AVFoundationRecognizedBarcode(
            payload: "https://example.com/two",
            bounds: CGRect(x: 20, y: 80, width: 40, height: 20)
        )
        let missingPayload = AVFoundationRecognizedBarcode(
            payload: nil,
            bounds: CGRect(x: 0, y: 0, width: 10, height: 10)
        )

        platform.eventSink?.avFoundationScannerDidOutput([first, missingPayload])
        platform.eventSink?.avFoundationScannerDidOutput([first, second])
        platform.eventSink?.avFoundationScannerDidOutput([])

        XCTAssertEqual(receivedFrames.map { $0.map(\.rawPayload) }, [
            ["https://example.com/one"],
            ["https://example.com/one", "https://example.com/two"],
            []
        ])
        XCTAssertEqual(
            receivedFrames[0][0].displayBounds,
            VisionKitScannerObservationSource.normalizedBounds(
                CGRect(x: 10, y: 40, width: 50, height: 20),
                in: CGSize(width: 100, height: 200)
            )
        )
        XCTAssertEqual(
            receivedFrames[1][1].displayBounds,
            VisionKitScannerObservationSource.normalizedBounds(
                CGRect(x: 20, y: 80, width: 40, height: 20),
                in: CGSize(width: 100, height: 200)
            )
        )
        XCTAssertTrue(receivedFrames.flatMap { $0 }.allSatisfy { $0.engineID == source.engineID })
        XCTAssertTrue(receivedFrames.flatMap { $0 }.allSatisfy { $0.timestamp == timestamp })
    }

    func testDeniedAndRestrictedPermissionNeverStartAVFoundationCapture() {
        let denied = AVFoundationScannerPlatformStub(isAuthorized: false)
        AVFoundationScannerObservationSource(
            platform: denied,
            clock: TestScannerClock(now: .distantPast)
        ).start { _ in }

        XCTAssertEqual(denied.makeControllerCount, 0)
        XCTAssertEqual(denied.startScanningCount, 0)

        let restricted = AVFoundationScannerPlatformStub(isAuthorized: false)
        AVFoundationScannerObservationSource(
            platform: restricted,
            clock: TestScannerClock(now: .distantPast)
        ).start { _ in }

        XCTAssertEqual(restricted.makeControllerCount, 0)
        XCTAssertEqual(restricted.startScanningCount, 0)
    }

    func testFactoryDoesNotStartFallbackCaptureWhenPermissionIsDeniedOrRestricted() {
        for authorization in [CameraAuthorization.denied, .restricted] {
            let source = ScannerObservationSourceFactory.make(
                arguments: ["QRScanner"],
                fixturesEnabled: true,
                dataScannerSupported: false,
                authorization: authorization
            )
            var receivedFrames: [[ScannerObservation]] = []
            source.start { receivedFrames.append($0) }

            XCTAssertEqual(source.engineID, ScannerEngineID("avfoundation"))
            XCTAssertTrue(receivedFrames.isEmpty)
            XCTAssertNil(source.previewController)
        }
    }

    func testRecognitionRegionIsTheFullPreviewAndNotACenterCrop() {
        let centerGuide = CGRect(x: 0.25, y: 0.35, width: 0.5, height: 0.3)
        let edgeBounds = [
            CGRect(x: 0.01, y: 0.40, width: 0.12, height: 0.12),
            CGRect(x: 0.87, y: 0.40, width: 0.12, height: 0.12),
            CGRect(x: 0.44, y: 0.01, width: 0.12, height: 0.12),
            CGRect(x: 0.44, y: 0.87, width: 0.12, height: 0.12)
        ]

        XCTAssertEqual(ScannerRecognitionRegion.fullPreview, CGRect(x: 0, y: 0, width: 1, height: 1))
        XCTAssertEqual(
            VisionKitScannerObservationSource.productConfiguration.recognitionRegion,
            ScannerRecognitionRegion.fullPreview
        )
        XCTAssertEqual(
            AVFoundationScannerObservationSource.productConfiguration.recognitionRegion,
            ScannerRecognitionRegion.fullPreview
        )
        XCTAssertEqual(
            AVFoundationScannerObservationSource.productConfiguration.videoGravity,
            ScannerPreviewPresentation.aspectFillGravity
        )

        for bounds in edgeBounds {
            XCTAssertFalse(centerGuide.intersects(bounds), "Edge codes sit outside the visual guide")
            XCTAssertTrue(ScannerRecognitionRegion.containsVisibleCode(at: bounds))
        }
    }

    func testAVFoundationEnginePublishesCodesNearEachPreviewEdge() {
        let timestamp = Date(timeIntervalSince1970: 1_728_000_500)
        let platform = AVFoundationScannerPlatformStub(isAuthorized: true)
        platform.viewSize = CGSize(width: 100, height: 200)
        let source = AVFoundationScannerObservationSource(
            platform: platform,
            clock: TestScannerClock(now: timestamp)
        )
        var receivedFrames: [[ScannerObservation]] = []
        source.start { receivedFrames.append($0) }

        XCTAssertEqual(platform.lastConfiguration?.recognitionRegion, ScannerRecognitionRegion.fullPreview)
        XCTAssertEqual(platform.lastConfiguration?.videoGravity, ScannerPreviewPresentation.aspectFillGravity)

        let edges: [(String, CGRect)] = [
            ("edge-left", CGRect(x: 1, y: 90, width: 12, height: 12)),
            ("edge-right", CGRect(x: 87, y: 90, width: 12, height: 12)),
            ("edge-top", CGRect(x: 44, y: 1, width: 12, height: 12)),
            ("edge-bottom", CGRect(x: 44, y: 187, width: 12, height: 12))
        ]

        platform.eventSink?.avFoundationScannerDidOutput(
            edges.map { AVFoundationRecognizedBarcode(payload: $0.0, bounds: $0.1) }
        )

        let frame = try! XCTUnwrap(receivedFrames.last)
        XCTAssertEqual(frame.map(\.rawPayload), edges.map(\.0))
        XCTAssertEqual(frame.map(\.displayBounds), [
            CGRect(x: 0.01, y: 0.45, width: 0.12, height: 0.06),
            CGRect(x: 0.87, y: 0.45, width: 0.12, height: 0.06),
            CGRect(x: 0.44, y: 0.005, width: 0.12, height: 0.06),
            CGRect(x: 0.44, y: 0.935, width: 0.12, height: 0.06)
        ])
        XCTAssertTrue(frame.allSatisfy { ScannerRecognitionRegion.containsVisibleCode(at: $0.displayBounds) })
    }

    func testObservationBoundsStayAlignedInPortraitLandscapeAndAfterResize() {
        let portrait = CGSize(width: 390, height: 844)
        let landscape = CGSize(width: 844, height: 390)
        let resized = CGSize(width: 200, height: 400)
        let layerBounds = CGRect(x: 12, y: 80, width: 90, height: 90)

        let portraitMapped = ScannerPreviewCoordinates.normalizedBounds(layerBounds, in: portrait)
        let landscapeMapped = ScannerPreviewCoordinates.normalizedBounds(layerBounds, in: landscape)
        let resizedMapped = ScannerPreviewCoordinates.normalizedBounds(layerBounds, in: resized)

        XCTAssertEqual(portraitMapped.origin.x, 12 / 390, accuracy: 0.0001)
        XCTAssertEqual(portraitMapped.origin.y, 80 / 844, accuracy: 0.0001)
        XCTAssertEqual(landscapeMapped.origin.x, 12 / 844, accuracy: 0.0001)
        XCTAssertEqual(landscapeMapped.origin.y, 80 / 390, accuracy: 0.0001)
        XCTAssertEqual(resizedMapped.size.width, 90 / 200, accuracy: 0.0001)
        XCTAssertEqual(resizedMapped.size.height, 90 / 400, accuracy: 0.0001)

        XCTAssertEqual(
            ScannerCaptureOrientation.videoOrientation(for: .portrait),
            .portrait
        )
        XCTAssertEqual(
            ScannerCaptureOrientation.videoOrientation(for: .landscapeLeft),
            .landscapeLeft
        )
        XCTAssertEqual(
            ScannerCaptureOrientation.videoOrientation(for: .landscapeRight),
            .landscapeRight
        )

        let platform = AVFoundationScannerPlatformStub(isAuthorized: true)
        platform.viewSize = portrait
        let source = AVFoundationScannerObservationSource(
            platform: platform,
            clock: TestScannerClock(now: Date(timeIntervalSince1970: 40))
        )
        var receivedFrames: [[ScannerObservation]] = []
        source.start { receivedFrames.append($0) }

        platform.eventSink?.avFoundationScannerDidOutput([
            AVFoundationRecognizedBarcode(payload: "aligned", bounds: layerBounds)
        ])
        platform.viewSize = landscape
        source.handlePreviewLayoutChange()
        platform.eventSink?.avFoundationScannerDidOutput([
            AVFoundationRecognizedBarcode(payload: "aligned", bounds: layerBounds)
        ])
        platform.viewSize = resized
        source.handlePreviewLayoutChange()
        platform.eventSink?.avFoundationScannerDidOutput([
            AVFoundationRecognizedBarcode(payload: "aligned", bounds: layerBounds)
        ])

        XCTAssertEqual(platform.layoutUpdateCount, 2)
        XCTAssertEqual(receivedFrames.map { $0.map(\.displayBounds) }, [
            [portraitMapped],
            [landscapeMapped],
            [resizedMapped]
        ])
    }

    func testPinchZoomAndTapFocusDoNotTriggerResultActions() {
        let platform = AVFoundationScannerPlatformStub(isAuthorized: true)
        let source = AVFoundationScannerObservationSource(
            platform: platform,
            clock: TestScannerClock(now: .distantPast)
        )
        source.start { _ in }

        let resultTray = CGRect(x: 0, y: 0.72, width: 1, height: 0.28)
        XCTAssertEqual(
            ScannerCameraInteractionRouter.hitTarget(
                at: CGPoint(x: 0.5, y: 0.4),
                resultActionRect: resultTray
            ),
            .camera
        )
        XCTAssertEqual(
            ScannerCameraInteractionRouter.hitTarget(
                at: CGPoint(x: 0.5, y: 0.85),
                resultActionRect: resultTray
            ),
            .resultAction
        )

        var resultActionCount = 0
        source.beginPinchZoom()
        source.updatePinchZoom(
            scale: 2,
            atNormalizedPoint: CGPoint(x: 0.5, y: 0.4),
            resultActionRect: resultTray,
            onResultAction: { resultActionCount += 1 }
        )
        source.focus(
            atNormalizedPoint: CGPoint(x: 0.2, y: 0.3),
            resultActionRect: resultTray,
            onResultAction: { resultActionCount += 1 }
        )
        source.focus(
            atNormalizedPoint: CGPoint(x: 0.5, y: 0.85),
            resultActionRect: resultTray,
            onResultAction: { resultActionCount += 1 }
        )

        XCTAssertEqual(resultActionCount, 1)
        XCTAssertEqual(platform.zoomFactor, 2)
        XCTAssertEqual(platform.focusPoint, CGPoint(x: 0.2, y: 0.3))
        XCTAssertTrue(source.usesCustomCameraGestures)
        XCTAssertFalse(
            VisionKitScannerObservationSource(
                platform: VisionKitScannerPlatformStub(isSupported: true, isAvailable: true),
                clock: TestScannerClock(now: .distantPast)
            ).usesCustomCameraGestures
        )
    }

    func testScanningPausesWhenScannerIsObscuredOrSceneIsInactiveAndResumesOnce() async {
        let platform = AVFoundationScannerPlatformStub(isAuthorized: true)
        let source = AVFoundationScannerObservationSource(
            platform: platform,
            clock: TestScannerClock(now: Date(timeIntervalSince1970: 50))
        )
        let session = ScannerSessionStore(
            cameraAccess: CameraAccessStub(authorization: .authorized),
            observationSource: source
        )

        await session.activateScanner()
        XCTAssertEqual(platform.startScanningCount, 1)

        session.handlePresentation(.obscured)
        session.handlePresentation(.obscured)
        XCTAssertEqual(platform.stopScanningCount, 1)
        XCTAssertEqual(platform.startScanningCount, 1)

        platform.eventSink?.avFoundationScannerDidOutput([
            AVFoundationRecognizedBarcode(payload: "ignored-while-obscured", bounds: CGRect(x: 0, y: 0, width: 10, height: 10))
        ])
        XCTAssertTrue(session.visibleObservations.isEmpty)

        session.handlePresentation(.visible)
        session.handlePresentation(.visible)
        XCTAssertEqual(platform.startScanningCount, 2)
        XCTAssertEqual(platform.makeControllerCount, 1)
        XCTAssertEqual(platform.stopScanningCount, 1)

        session.handleLifecycle(.inactive)
        session.handleLifecycle(.inactive)
        XCTAssertEqual(platform.stopScanningCount, 2)

        session.handleLifecycle(.active)
        session.handleLifecycle(.active)
        XCTAssertEqual(platform.startScanningCount, 3)
        XCTAssertEqual(platform.stopScanningCount, 2)
    }

    func testCoordinateMappingDoesNotRequireTheMainActor() {
        let expectation = expectation(description: "map off the main actor")
        let bounds = CGRect(x: 10, y: 20, width: 30, height: 40)
        let viewSize = CGSize(width: 100, height: 200)

        DispatchQueue.global(qos: .userInitiated).async {
            XCTAssertFalse(Thread.isMainThread)
            let mapped = ScannerObservationMapper.map(
                payload: "off-main",
                bounds: bounds,
                viewSize: viewSize,
                timestamp: Date(timeIntervalSince1970: 1),
                engineID: ScannerEngineID("avfoundation")
            )
            XCTAssertEqual(
                mapped?.displayBounds,
                ScannerPreviewCoordinates.normalizedBounds(bounds, in: viewSize)
            )
            expectation.fulfill()
        }

        wait(for: [expectation], timeout: 1)
    }

    func testNamedEdgeFixtureEmitsACodeNearEachPreviewEdge() {
        let timestamp = Date(timeIntervalSince1970: 1_728_000_600)
        let source = ScannerObservationSourceFactory.make(
            arguments: ["QRScanner", "--scanner-fixture", "edge-codes"],
            fixturesEnabled: true,
            clock: TestScannerClock(now: timestamp)
        )
        var receivedFrames: [[ScannerObservation]] = []
        source.start { receivedFrames.append($0) }

        XCTAssertEqual(source.engineID, ScannerEngineID("fixture.edge-codes"))
        let frame = try! XCTUnwrap(receivedFrames.first)
        XCTAssertEqual(frame.map(\.rawPayload), [
            "https://example.com/edge-left",
            "https://example.com/edge-right",
            "https://example.com/edge-top",
            "https://example.com/edge-bottom"
        ])
        XCTAssertTrue(frame.allSatisfy { ScannerRecognitionRegion.containsVisibleCode(at: $0.displayBounds) })
        XCTAssertFalse(frame.contains { CGRect(x: 0.25, y: 0.35, width: 0.5, height: 0.3).intersects($0.displayBounds) })
    }

    private func detection(_ rawPayload: String) -> ScannerFixtureDetection {
        ScannerFixtureDetection(
            rawPayload: rawPayload,
            displayBounds: CGRect(x: 0.1, y: 0.1, width: 0.2, height: 0.2)
        )
    }
}

private final class TestScannerClock: ScannerClock {
    var now: Date

    init(now: Date) {
        self.now = now
    }
}

@MainActor
private final class VisionKitScannerPlatformStub: VisionKitScannerPlatform {
    var isSupported: Bool
    var isAvailable: Bool
    var makeControllerCount = 0
    var startScanningCount = 0
    var stopScanningCount = 0
    var isScanning = false
    var viewSize = CGSize(width: 100, height: 200)
    private(set) var lastConfiguration: VisionKitScannerConfiguration?
    private(set) weak var eventSink: VisionKitScannerEventSink?

    init(isSupported: Bool, isAvailable: Bool) {
        self.isSupported = isSupported
        self.isAvailable = isAvailable
    }

    func makeController(
        configuration: VisionKitScannerConfiguration,
        eventSink: VisionKitScannerEventSink
    ) -> VisionKitScannerControlling {
        makeControllerCount += 1
        lastConfiguration = configuration
        self.eventSink = eventSink
        return VisionKitScannerControllerStub(platform: self)
    }
}

@MainActor
private final class VisionKitScannerControllerStub: VisionKitScannerControlling {
    private let platform: VisionKitScannerPlatformStub

    var isScanning: Bool { platform.isScanning }
    var viewSize: CGSize { platform.viewSize }
    var previewController: UIViewController? { nil }

    init(platform: VisionKitScannerPlatformStub) {
        self.platform = platform
    }

    func startScanning() throws {
        platform.startScanningCount += 1
        platform.isScanning = true
    }

    func stopScanning() {
        platform.stopScanningCount += 1
        platform.isScanning = false
    }
}

@MainActor
private final class AVFoundationScannerPlatformStub: AVFoundationScannerPlatform {
    var isAuthorized: Bool
    var makeControllerCount = 0
    var startScanningCount = 0
    var stopScanningCount = 0
    var layoutUpdateCount = 0
    var isScanning = false
    var viewSize = CGSize(width: 100, height: 200)
    var zoomFactor: CGFloat = 1
    var minZoomFactor: CGFloat = 1
    var maxZoomFactor: CGFloat = 8
    var focusPoint: CGPoint?
    private(set) var lastMetadataObjectTypes: [String]?
    private(set) var lastConfiguration: AVFoundationScannerConfiguration?
    private(set) weak var eventSink: AVFoundationScannerEventSink?

    init(isAuthorized: Bool) {
        self.isAuthorized = isAuthorized
    }

    func makeController(
        configuration: AVFoundationScannerConfiguration,
        eventSink: AVFoundationScannerEventSink
    ) -> AVFoundationScannerControlling {
        makeControllerCount += 1
        lastConfiguration = configuration
        lastMetadataObjectTypes = configuration.metadataObjectTypes
        self.eventSink = eventSink
        return AVFoundationScannerControllerStub(platform: self)
    }
}

@MainActor
private final class AVFoundationScannerControllerStub: AVFoundationScannerControlling {
    private let platform: AVFoundationScannerPlatformStub

    var isScanning: Bool { platform.isScanning }
    var viewSize: CGSize { platform.viewSize }
    var previewController: UIViewController? { nil }

    init(platform: AVFoundationScannerPlatformStub) {
        self.platform = platform
    }

    func startScanning() throws {
        platform.startScanningCount += 1
        platform.isScanning = true
    }

    var zoomFactor: CGFloat { platform.zoomFactor }
    var minZoomFactor: CGFloat { platform.minZoomFactor }
    var maxZoomFactor: CGFloat { platform.maxZoomFactor }

    func stopScanning() {
        platform.stopScanningCount += 1
        platform.isScanning = false
    }

    func setZoomFactor(_ factor: CGFloat) {
        platform.zoomFactor = min(platform.maxZoomFactor, max(platform.minZoomFactor, factor))
    }

    func focus(atNormalizedPoint point: CGPoint) {
        platform.focusPoint = point
    }

    func updatePreviewLayout() {
        platform.layoutUpdateCount += 1
    }
}

@MainActor
private final class CameraAccessStub: CameraAccessProviding {
    var authorization: CameraAuthorization
    var cameraAvailable: Bool
    var requestCount = 0

    private let authorizationAfterRequest: CameraAuthorization

    init(
        authorization: CameraAuthorization,
        cameraAvailable: Bool = true,
        authorizationAfterRequest: CameraAuthorization? = nil
    ) {
        self.authorization = authorization
        self.cameraAvailable = cameraAvailable
        self.authorizationAfterRequest = authorizationAfterRequest ?? authorization
    }

    func requestAuthorization() async {
        requestCount += 1
        authorization = authorizationAfterRequest
    }
}
