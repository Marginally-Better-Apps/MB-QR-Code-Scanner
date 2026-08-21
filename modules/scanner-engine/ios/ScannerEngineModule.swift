import AVFoundation
import ExpoModulesCore
import UIKit
import VisionKit

public class ScannerEngineModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ScannerEngine")

    Function("getCapabilities") {
      Isolation.onMain { LaunchConfiguration.capabilities() }
    }

    AsyncFunction("requestAuthorization") {
      _ = await AVCaptureDevice.requestAccess(for: .video)
      return Isolation.onMain { LaunchConfiguration.authorizationRaw() }
    }

    Function("refreshAuthorization") {
      Isolation.onMain { LaunchConfiguration.authorizationRaw() }
    }

    Function("openSettings") {
      Isolation.onMain {
        guard let url = URL(string: UIApplication.openSettingsURLString) else {
          return
        }
        UIApplication.shared.open(url)
      }
    }

    View(ScannerPreviewView.self) {
      Events("onObservations", "onPreviewReady")
      Prop("engine") { (view: ScannerPreviewView, engine: String) in
        view.engineName = engine
      }
      Prop("running") { (view: ScannerPreviewView, running: Bool) in
        view.running = running
      }
      Prop("imageFixture") { (view: ScannerPreviewView, imageFixture: String?) in
        view.imageFixtureName = imageFixture
      }
    }
  }
}

private enum Isolation {
  static func onMain<T>(_ work: @MainActor () -> T) -> T {
    if Thread.isMainThread {
      return MainActor.assumeIsolated(work)
    }
    return DispatchQueue.main.sync {
      MainActor.assumeIsolated(work)
    }
  }
}

@MainActor
enum LaunchConfiguration {
  static func capabilities() -> [String: Any] {
    var payload: [String: Any] = [
      "dataScannerSupported": DataScannerViewController.isSupported,
      "dataScannerAvailable": DataScannerViewController.isAvailable,
      "authorization": authorizationRaw(),
      "cameraAvailable": AVCaptureDevice.default(for: .video) != nil,
      "allowsFixtures": allowsFixtures,
    ]
    if let cameraFixture = stringValue(flag: "--camera-fixture", defaultsKey: "cameraFixture") {
      payload["cameraFixture"] = cameraFixture
    }
    if let scannerFixture = stringValue(flag: "--scanner-fixture", defaultsKey: "scannerFixture") {
      payload["scannerFixture"] = scannerFixture
    }
    if let nativeImageFixture = stringValue(
      flag: "--native-image-fixture",
      defaultsKey: "nativeImageFixture"
    ) {
      payload["nativeImageFixture"] = nativeImageFixture
    }
    return payload
  }

  static func authorizationRaw() -> String {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .notDetermined:
      return "notDetermined"
    case .authorized:
      return "authorized"
    case .denied:
      return "denied"
    case .restricted:
      return "restricted"
    @unknown default:
      return "restricted"
    }
  }

  static var allowsFixtures: Bool {
#if DEBUG
    true
#else
    let arguments = ProcessInfo.processInfo.arguments
    return arguments.contains("--scanner-fixture")
      || arguments.contains("--camera-fixture")
      || arguments.contains("--native-image-fixture")
      || arguments.contains("-scannerFixture")
      || arguments.contains("-cameraFixture")
      || arguments.contains("-nativeImageFixture")
#endif
  }

  private static func stringValue(flag: String, defaultsKey: String) -> String? {
    let arguments = ProcessInfo.processInfo.arguments
    if let index = arguments.firstIndex(of: flag), arguments.indices.contains(index + 1) {
      return arguments[index + 1]
    }
    return UserDefaults.standard.string(forKey: defaultsKey)
  }
}
