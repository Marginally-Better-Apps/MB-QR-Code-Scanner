import SwiftUI

/// A result's title and subtitle. Web links put the host on its own line, truncated at the head so the
/// registrable domain at the end is always visible, and plain `http` links are marked as not secure.
struct ResultTitle: View {
  let payload: ScanPayload
  var titleFont: Font = .body
  var subtitleFont: Font = .footnote
  /// Lines per text at standard sizes; accessibility sizes allow up to three.
  var lineLimit = 1
  @Environment(\.dynamicTypeSize) private var typeSize

  private var lines: Int { typeSize.isAccessibilitySize ? max(lineLimit, 3) : lineLimit }

  var body: some View {
    let link = LinkDisplay(payload)
    VStack(alignment: .leading, spacing: 2) {
      if let link {
        Text(verbatim: link.host).font(titleFont).lineLimit(lines).truncationMode(.head)
        if !link.path.isEmpty {
          Text(verbatim: link.path).font(subtitleFont).foregroundStyle(.secondary).lineLimit(lines).truncationMode(.middle)
        }
      } else {
        Text(verbatim: payload.title).font(titleFont).lineLimit(lines)
      }
      subtitle(insecure: link?.isInsecure == true).font(subtitleFont).lineLimit(lines)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(accessibilityText(link))
  }

  private func subtitle(insecure: Bool) -> Text {
    let kind = Text(verbatim: payload.subtitle).foregroundStyle(.secondary)
    guard insecure else { return kind }
    // Color is a second cue; the icon and words carry the warning.
    return Text(Image(systemName: "exclamationmark.triangle.fill")).foregroundStyle(.red)
      + Text(verbatim: " ") + Text("Not Secure").foregroundStyle(.red) + Text(verbatim: " · ").foregroundStyle(.secondary) + kind
  }

  private func accessibilityText(_ link: LinkDisplay?) -> Text {
    let title = Text(verbatim: (link?.hostAndPath ?? payload.title) + ", " + payload.subtitle)
    return link?.isInsecure == true ? Text("Not Secure") + Text(verbatim: ", ") + title : title
  }
}
