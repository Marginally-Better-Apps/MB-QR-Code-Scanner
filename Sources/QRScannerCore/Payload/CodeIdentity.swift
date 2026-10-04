import Foundation

/// The one rule that decides whether two decoded payloads are the same code.
enum CodeIdentity {
  /// Surrounding padding: whitespace plus byte-order marks and zero-width spaces that encoders prepend.
  private static let padding = CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: "\u{FEFF}\u{200B}"))

  /// Applies Unicode NFC and trims surrounding padding, so a payload decoded with composed or
  /// decomposed accents, a byte-order mark, or stray spaces is treated as one code.
  static func normalize(_ payload: String) -> String {
    payload.precomposedStringWithCanonicalMapping.trimmingCharacters(in: padding)
  }

  /// A stable identifier for a payload read with a particular symbology.
  static func id(_ payload: String, format: CodeFormat) -> String {
    format.rawValue + ":" + normalize(payload)
  }
}
