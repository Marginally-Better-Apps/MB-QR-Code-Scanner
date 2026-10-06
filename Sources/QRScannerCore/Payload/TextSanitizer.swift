import Foundation

/// Makes scanned text safe to show without hiding legitimate scripts or emoji.
///
/// Kept: letters, emoji, ZWNJ/ZWJ (Persian and emoji sequences), and emoji tag characters.
/// Replaced with U+FFFD so tampering stays visible: control characters, bidirectional
/// overrides, embeddings and isolates, and every other invisible format character.
enum TextSanitizer {
  static let titleLimit = 120
  static let detailsLimit = 20_000
  static let replacement: Unicode.Scalar = "\u{FFFD}"

  private static let allowedFormatScalars: Set<UInt32> = [0x200C, 0x200D]
  private static let emojiTagScalars: ClosedRange<UInt32> = 0xE0020...0xE007F

  /// One line of text: line breaks and tabs become single spaces.
  static func title(_ value: String, limit: Int = titleLimit) -> String {
    truncate(sanitize(value, keepLineBreaks: false), limit: limit)
  }

  /// Multi-line text: line breaks are normalized to `\n`, tabs become spaces.
  static func details(_ value: String, limit: Int = detailsLimit) -> String {
    truncate(sanitize(value, keepLineBreaks: true), limit: limit)
  }

  /// True when the text has any control or invisible format character, including line
  /// breaks. Such payloads are shown but never turned into actions.
  static func containsControls(_ value: String) -> Bool {
    value.unicodeScalars.contains {
      switch $0.properties.generalCategory {
      case .control, .format, .lineSeparator, .paragraphSeparator, .surrogate: true
      default: false
      }
    }
  }

  static func isDisplayable(_ scalar: Unicode.Scalar) -> Bool {
    switch scalar.properties.generalCategory {
    case .control, .surrogate, .lineSeparator, .paragraphSeparator: false
    case .format: allowedFormatScalars.contains(scalar.value) || emojiTagScalars.contains(scalar.value)
    default: true
    }
  }

  private static func isLineBreak(_ scalar: Unicode.Scalar) -> Bool {
    switch scalar.value {
    case 0x0A, 0x0B, 0x0C, 0x0D, 0x85, 0x2028, 0x2029: true
    default: false
    }
  }

  private static func sanitize(_ value: String, keepLineBreaks: Bool) -> String {
    var output = String.UnicodeScalarView()
    var previous: Unicode.Scalar?
    for scalar in value.unicodeScalars {
      defer { previous = scalar }
      if isLineBreak(scalar) {
        // CRLF is one break.
        if scalar == "\n", previous == "\r" { continue }
        if keepLineBreaks { output.append("\n") }
        else if output.last != " " { output.append(" ") }
      } else if scalar == "\t" {
        output.append(" ")
      } else {
        output.append(isDisplayable(scalar) ? scalar : replacement)
      }
    }
    return String(output)
  }

  private static func truncate(_ value: String, limit: Int) -> String {
    guard limit > 0, value.count > limit else { return value }
    return String(value.prefix(limit - 1)) + "…"
  }
}
