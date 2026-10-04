import SwiftUI

/// Hosts the capture preview and forwards decoded frames to the scanner.
struct CameraPreview: UIViewRepresentable {
  let model: ScannerViewModel

  func makeUIView(context: Context) -> ScannerPreviewView {
    let view = ScannerPreviewView(frame: .zero)
    view.onObservations = { [weak model] observations in
      model?.receive(observations)
    }
    return view
  }

  func updateUIView(_ view: ScannerPreviewView, context: Context) {
    if view.imageFixtureName != model.imageFixture { view.imageFixtureName = model.imageFixture }
    if view.running != model.isCapturing { view.running = model.isCapturing }
    if view.torchEnabled != model.torchOn { view.torchEnabled = model.torchOn }
  }

  static func dismantleUIView(_ view: ScannerPreviewView, coordinator: ()) { view.running = false }
}
