import SwiftUI

/// Liquid Glass buttons on iOS 26, bordered buttons earlier.
struct NativeButton: ViewModifier {
  func body(content: Content) -> some View {
    if #available(iOS 26.0, *) { content.buttonStyle(.glass) }
    else { content.buttonStyle(.bordered) }
  }
}

/// Liquid Glass on iOS 26, system material earlier. Reduce Transparency and Increase Contrast
/// get an opaque background, and Increase Contrast adds a visible edge.
struct NativeGlass: ViewModifier {
  var cornerRadius: CGFloat = 28
  var interactive = false
  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
  @Environment(\.colorSchemeContrast) private var contrast

  func body(content: Content) -> some View {
    let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
    if reduceTransparency || contrast == .increased {
      content
        .background(Color(uiColor: .secondarySystemBackground), in: shape)
        .overlay {
          if contrast == .increased { shape.strokeBorder(Color(uiColor: .separator), lineWidth: 1) }
        }
    } else if #available(iOS 26.0, *) {
      content.glassEffect(.regular.interactive(interactive), in: .rect(cornerRadius: cornerRadius))
    } else {
      content.background(.regularMaterial, in: shape)
    }
  }
}
