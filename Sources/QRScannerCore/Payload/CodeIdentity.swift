import Foundation

/// The one rule that decides whether two decoded payloads are the same code.
enum CodeIdentity {
  /// Applies Unicode NFC and trims surrounding whitespace, so a payload decoded with
  /// composed or decomposed accents, or with stray padding, is treated as one code.
  static func normalize(_ payload: String) -> String {
    payload.precomposedStringWithCanonicalMapping.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  /// A stable identifier for a payload read with a particular symbology.
  static func id(_ payload: String, format: CodeFormat) -> String {
    format.rawValue + ":" + normalize(payload)
  }
}
