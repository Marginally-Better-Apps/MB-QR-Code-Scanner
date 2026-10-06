import SwiftUI

/// The prominent call to action: Liquid Glass on iOS 26, bordered prominent before.
struct ProminentButton: ViewModifier {
  func body(content: Content) -> some View {
    if #available(iOS 26.0, *) { content.buttonStyle(.glassProminent) }
    else { content.buttonStyle(.borderedProminent) }
  }
}
