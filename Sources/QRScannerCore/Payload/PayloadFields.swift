import Foundation

/// `KEY:value;KEY:value;;` records used by MECARD, MATMSG, and Wi-Fi codes.
/// A backslash escapes the next character, for example `\;`, `\,`, `\:`, `\\`, or `\"`.
struct SemicolonFields {
  struct Field {
    let key: String
    /// The value as written, with escapes intact so callers can split on unescaped separators.
    let escapedValue: String
    var value: String { SemicolonFields.unescape(escapedValue) }
  }

  let fields: [Field]

  init(_ body: String) {
    var records: [String] = [], current = "", escaped = false
    for character in body {
      if escaped { current.append(character); escaped = false; continue }
      if character == "\\" { escaped = true; current.append(character) }
      else if character == ";" { records.append(current); current = "" }
      else { current.append(character) }
    }
    records.append(current)
    fields = records.compactMap { record in
      guard let colon = record.firstIndex(of: ":") else { return nil }
      return Field(key: record[..<colon].uppercased(), escapedValue: String(record[record.index(after: colon)...]))
    }
  }

  /// The first value for a key. Later duplicates are ignored.
  subscript(key: String) -> String? { field(key)?.value }

  func field(_ key: String) -> Field? { fields.first { $0.key == key } }

  /// Every value for a repeatable key such as `TEL` or `EMAIL`, in order.
  func values(_ key: String) -> [String] { fields.filter { $0.key == key }.map(\.value) }

  static func unescape(_ value: String) -> String {
    var result = "", escaped = false
    for character in value {
      if escaped { result.append(character); escaped = false }
      else if character == "\\" { escaped = true }
      else { result.append(character) }
    }
    if escaped { result.append("\\") }
    return result
  }

  /// Splits an escaped value on an unescaped separator, then unescapes each part.
  static func split(_ escapedValue: String, on separator: Character) -> [String] {
    splitEscaped(escapedValue, on: separator).map(unescape)
  }

  /// Removes one pair of unescaped surrounding double quotes, as Wi-Fi codes allow.
  static func unquote(_ escapedValue: String) -> String {
    guard escapedValue.count >= 2, escapedValue.hasPrefix("\""), escapedValue.hasSuffix("\""),
      !escapedValue.dropLast().hasSuffix("\\") || escapedValue.dropLast().hasSuffix("\\\\") else { return escapedValue }
    return String(escapedValue.dropFirst().dropLast())
  }
}

/// Splits on a separator that is not preceded by a backslash. Escapes are kept.
private func splitEscaped(_ value: String, on separator: Character) -> [String] {
  var parts: [String] = [], current = "", escaped = false
  for character in value {
    if escaped { current.append(character); escaped = false }
    else if character == "\\" { current.append(character); escaped = true }
    else if character == separator { parts.append(current); current = "" }
    else { current.append(character) }
  }
  parts.append(current)
  return parts
}

/// One unfolded iCalendar or vCard content line: `NAME;PARAM=value:VALUE`.
struct ICalLine {
  let name: String
  let parameters: [String: String]
  /// The value as written, with iCalendar escapes intact.
  let rawValue: String
  var text: String { ICalFields.unescape(rawValue) }
}

/// Reads iCalendar (RFC 5545) and vCard (RFC 6350) content lines.
enum ICalFields {
  /// Unfolds continuation lines and parses every content line in order.
  static func lines(_ raw: String) -> [ICalLine] {
    let unfolded = raw
      .replacingOccurrences(of: "\r\n ", with: "").replacingOccurrences(of: "\r\n\t", with: "")
      .replacingOccurrences(of: "\n ", with: "").replacingOccurrences(of: "\n\t", with: "")
    return unfolded.components(separatedBy: .newlines).compactMap(parse)
  }

  /// Parses `NAME;KEY=value;KEY="quoted:value":VALUE`. Group prefixes such as `item1.` are dropped.
  static func parse(_ line: String) -> ICalLine? {
    let characters = Array(line)
    var index = 0
    var name = ""
    while index < characters.count, characters[index] != ";", characters[index] != ":" {
      name.append(characters[index]); index += 1
    }
    var parameters: [String: String] = [:]
    while index < characters.count, characters[index] == ";" {
      index += 1
      var key = "", value = "", inQuotes = false, readingValue = false
      while index < characters.count {
        let character = characters[index]
        if character == "\"" { inQuotes.toggle() }
        else if !inQuotes, character == ";" || character == ":" { break }
        else if !readingValue, character == "=" { readingValue = true }
        else if readingValue { value.append(character) }
        else { key.append(character) }
        index += 1
      }
      let parameter = key.trimmingCharacters(in: .whitespaces).uppercased()
      if !parameter.isEmpty, parameters[parameter] == nil { parameters[parameter] = value }
    }
    guard index < characters.count, characters[index] == ":" else { return nil }
    if let dot = name.lastIndex(of: ".") { name = String(name[name.index(after: dot)...]) }
    name = name.trimmingCharacters(in: .whitespaces).uppercased()
    guard !name.isEmpty else { return nil }
    return ICalLine(name: name, parameters: parameters, rawValue: String(characters[(index + 1)...]))
  }

  /// Decodes TEXT escapes in a single pass, so `\\n` stays a backslash followed by `n`.
  static func unescape(_ value: String) -> String {
    var result = "", escaped = false
    for character in value {
      if escaped {
        switch character {
        case "n", "N": result.append("\n")
        case "\\", ",", ";", ":": result.append(character)
        default: result.append("\\"); result.append(character)
        }
        escaped = false
      } else if character == "\\" { escaped = true }
      else { result.append(character) }
    }
    if escaped { result.append("\\") }
    return result
  }

  /// Splits a structured value such as `N` or `ADR` on unescaped semicolons.
  static func components(_ rawValue: String) -> [String] {
    splitEscaped(rawValue, on: ";").map(unescape)
  }

  /// The properties of the first `name` component, excluding nested components such as
  /// `VALARM`. Nil when the component never closes.
  static func firstComponent(_ name: String, in lines: [ICalLine]) -> [ICalLine]? {
    var properties: [ICalLine] = []
    var inside = false, depth = 0
    for line in lines {
      let value = line.rawValue.trimmingCharacters(in: .whitespaces).uppercased()
      if !inside {
        if line.name == "BEGIN", value == name { inside = true }
        continue
      }
      if line.name == "BEGIN" { depth += 1 }
      else if line.name == "END" {
        if depth == 0 { return value == name ? properties : nil }
        depth -= 1
      } else if depth == 0 { properties.append(line) }
    }
    return nil
  }

  static func count(_ name: String, in lines: [ICalLine]) -> Int {
    lines.filter { $0.name == "BEGIN" && $0.rawValue.trimmingCharacters(in: .whitespaces).uppercased() == name }.count
  }
}

extension Array where Element == ICalLine {
  func property(_ name: String) -> ICalLine? { first { $0.name == name } }
  func properties(_ name: String) -> [ICalLine] { filter { $0.name == name } }
}
