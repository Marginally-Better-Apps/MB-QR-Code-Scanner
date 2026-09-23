// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "QRScanner",
  platforms: [.macOS(.v14), .iOS(.v17)],
  products: [.library(name: "QRScannerCore", targets: ["QRScannerCore"])],
  targets: [
    .target(name: "QRScannerCore"),
    .testTarget(name: "QRScannerCoreTests", dependencies: ["QRScannerCore"], resources: [.process("Fixtures")]),
  ],
  swiftLanguageModes: [.v5]
)
