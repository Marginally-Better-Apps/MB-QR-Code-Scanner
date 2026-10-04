import SwiftUI

extension EnvironmentValues {
  @Entry var showToast: (String) -> Void = { _ in }
}

extension View {
  /// Confirms quick actions such as Copy for sighted users; VoiceOver hears an announcement.
  func toastHost() -> some View { modifier(ToastHost()) }
}

private struct ToastHost: ViewModifier {
  @State private var message: String?
  @State private var generation = 0
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.colorSchemeContrast) private var contrast

  func body(content: Content) -> some View {
    content
      .environment(\.showToast) { text in
        generation += 1
        let current = generation
        withAnimation(reduceMotion ? .easeInOut(duration: 0.2) : .snappy) { message = text }
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        UIAccessibility.post(notification: .announcement, argument: text)
        Task { @MainActor in
          try? await Task.sleep(for: .seconds(2))
          guard generation == current else { return }
          withAnimation(reduceMotion ? .easeInOut(duration: 0.2) : .smooth) { message = nil }
        }
      }
      .overlay(alignment: .top) {
        if let message {
          Label { Text(message) } icon: {
            Image(systemName: "checkmark.circle.fill").foregroundStyle(contrast == .increased ? .primary : Color.green)
          }
          .font(.subheadline.weight(.semibold))
          .padding(.horizontal, 18)
          .padding(.vertical, 12)
          .modifier(NativeGlass(cornerRadius: 24))
          .overlay {
            if contrast == .increased {
              RoundedRectangle(cornerRadius: 24).strokeBorder(Color.primary.opacity(0.6), lineWidth: 1)
            }
          }
          .padding(.top, 8)
          // Reduce Motion swaps the slide for a fade.
          .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
          .allowsHitTesting(false)
          .accessibilityIdentifier("toast")
        }
      }
  }
}
