import SwiftUI

struct ScannerScreen: View {
  @Bindable var model: ScannerModel
  @State private var detail: ScanPayload?
  @State private var route: ActionRoute?
  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
  @Environment(\.scenePhase) private var scenePhase

  var body: some View {
    GeometryReader { geometry in
      ZStack {
        Color.black.ignoresSafeArea()
        if model.cameraState == .ready {
          if model.fixtureName == nil {
            CameraPreview(model: model).ignoresSafeArea()
          } else {
            // Deterministic simulator scene for UI checks, never used by live capture.
            LinearGradient(colors: [.indigo.opacity(0.7), .black, .teal.opacity(0.5)], startPoint: .topLeading, endPoint: .bottomTrailing).ignoresSafeArea()
          }
          DetectionHighlights(model: model).ignoresSafeArea().allowsHitTesting(false)
        } else {
          permissionView
        }
      }
      .overlay(alignment: .topTrailing) {
        NavigationLink {
          HistoryScreen(model: model)
        } label: {
          Image(systemName: "clock").font(.system(size: 21)).frame(width: 44, height: 44)
        }
        .modifier(NativeButton())
        .accessibilityLabel("History")
        .accessibilityIdentifier("open-history")
        .padding(.trailing, 16)
        .padding(.top, 8)
      }
      .safeAreaInset(edge: .bottom, spacing: 0) {
        if !model.results.isEmpty && model.cameraState == .ready {
          ResultsPanel(results: model.results, maxHeight: geometry.size.height * 0.38,
            onDetails: { detail = $0 }, onAction: { route = $0 }, onDismiss: { model.dismiss($0) })
            .frame(maxWidth: 540)
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
        }
      }
    }
    .toolbar(.hidden, for: .navigationBar)
    .onAppear {
      model.showingHistory = false
      Task { await model.activate() }
    }
    .sheet(item: $detail) { ResultDetail(payload: $0) }
    .sheet(item: $route) { route in NativeActionSheet(route: route) }
    .onChange(of: scenePhase) { _, phase in
      if phase == .background {
        detail = nil
        route = nil
      }
    }
  }

  @ViewBuilder private var permissionView: some View {
    VStack(spacing: 16) {
      switch model.cameraState {
      case .requesting: ProgressView().tint(.white)
      case .denied:
        Text("Camera Access Is Off").font(.title2.bold())
        Button("Open Settings") { UIApplication.shared.open(URL(string: UIApplication.openSettingsURLString)!) }
          .modifier(NativeButton()).accessibilityIdentifier("camera-primary-action")
      case .restricted: Text("Camera Access Is Restricted").font(.title2.bold())
      case .unavailable: Text("Camera Unavailable").font(.title2.bold())
      case .ready: EmptyView()
      }
    }.foregroundStyle(.white).padding(24)
  }
}

private struct DetectionHighlights: View {
  let model: ScannerModel
  var body: some View {
    GeometryReader { frame in
      ForEach(model.highlights) { detection in
        RoundedRectangle(cornerRadius: 8)
          .stroke(.yellow, lineWidth: 2)
          .frame(width: detection.bounds.width * frame.size.width, height: detection.bounds.height * frame.size.height)
          .position(x: detection.bounds.midX * frame.size.width, y: detection.bounds.midY * frame.size.height)
          .accessibilityHidden(true)
          .accessibilityIdentifier("scanner-observation-bounds")
      }
    }
  }
}

struct CameraPreview: UIViewRepresentable {
  let model: ScannerModel
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
  }
  static func dismantleUIView(_ view: ScannerPreviewView, coordinator: ()) { view.running = false }
}

struct NativeButton: ViewModifier {
  func body(content: Content) -> some View {
    if #available(iOS 26.0, *) { content.buttonStyle(.glass) }
    else { content.buttonStyle(.bordered) }
  }
}

struct NativeGlass: ViewModifier {
  var cornerRadius: CGFloat = 28
  var interactive = false
  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
  func body(content: Content) -> some View {
    if reduceTransparency {
      content.background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: cornerRadius))
    } else if #available(iOS 26.0, *) {
      content.glassEffect(.regular.interactive(interactive), in: .rect(cornerRadius: cornerRadius))
    } else {
      content.background(.regularMaterial, in: RoundedRectangle(cornerRadius: cornerRadius))
    }
  }
}
