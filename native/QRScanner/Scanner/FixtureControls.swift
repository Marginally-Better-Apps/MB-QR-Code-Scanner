#if DEBUG || targetEnvironment(simulator)
import SwiftUI

/// UI-test controls that change the simulated scene at runtime. Shown only when a
/// `scannerFixture` launch argument replaces the camera, and never compiled into device Release builds.
struct FixtureControls: View {
  let model: ScannerViewModel

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      control("Clear", id: "fixture-clear") { model.setSimulatedScene([]) }
      control("First", id: "fixture-inject-first") { model.setSimulatedScene(LaunchFixtures.detections(named: "url")) }
      control("Second", id: "fixture-inject-second") { model.setSimulatedScene(LaunchFixtures.detections(named: "second")) }
      Text(verbatim: "\(model.highlights.count) highlighted")
        .font(.caption2.monospacedDigit())
        .foregroundStyle(.white.opacity(0.7))
        .accessibilityIdentifier("fixture-highlight-count")
    }
  }

  private func control(_ title: String, id: String, action: @escaping () -> Void) -> some View {
    Button(action: action) { Text(verbatim: title).font(.caption2) }
      .buttonStyle(.bordered)
      .controlSize(.mini)
      .tint(.white)
      .accessibilityIdentifier(id)
  }
}
#endif
