// swift-tools-version: 6.0
import PackageDescription

// Swift 5 mode with complete checking: data races warn now without Swift 6 runtime isolation traps.
let strictConcurrency: [SwiftSetting] = [.enableUpcomingFeature("StrictConcurrency")]

let package = Package(
  name: "QRScanner",
  platforms: [.macOS(.v14), .iOS(.v17)],
  products: [.library(name: "QRScannerCore", targets: ["QRScannerCore"])],
  targets: [
    .target(name: "QRScannerCore", swiftSettings: strictConcurrency),
    .testTarget(
      name: "QRScannerCoreTests", dependencies: ["QRScannerCore"], resources: [.process("Fixtures")],
      swiftSettings: strictConcurrency),
  ],
  swiftLanguageModes: [.v5]
)
