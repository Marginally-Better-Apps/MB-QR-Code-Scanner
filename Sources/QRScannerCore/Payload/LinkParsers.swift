import Foundation

/// http(s) links, including bare hosts such as `example.com/path` or `example.com:8080/path`.
enum WebURLParser: PayloadKindParser {
  /// A bare `name.ext` whose last label is a common file extension is a file name, not a host.
  /// Explicit `https://notes.txt` is still a link. Real TLDs that are mostly sites (`.ai`,
  /// `.io`, `.sh`, `.app`) are not listed.
  static let fileExtensions: Set<String> = [
    "txt", "pdf", "doc", "docx", "rtf", "pages", "xls", "xlsx", "csv", "numbers", "ppt", "pptx", "key",
    "json", "xml", "yaml", "yml", "md", "htm", "html", "log", "ini", "cfg", "conf", "plist",
    "png", "jpg", "jpeg", "gif", "heic", "webp", "svg", "bmp", "tif", "tiff",
    "mp3", "mp4", "m4a", "mov", "wav", "aac", "zip", "gz", "tar", "rar", "dmg", "pkg", "ipa", "apk", "exe", "msi",
    "js", "ts", "py", "swift", "pem", "sqlite", "bak", "tmp",
  ]

  private static let bareHostPattern = #"^(?:[A-Za-z0-9\p{L}](?:[A-Za-z0-9\p{L}-]*[A-Za-z0-9\p{L}])?\.)+([A-Za-z\p{L}]{2,})(?::[0-9]+)?(?:[/?#].*)?$"#

  static func looksLikeBareHost(_ raw: String) -> Bool {
    guard !raw.contains(" "), !raw.contains("@"), !raw.isEmpty,
      let match = raw.range(of: bareHostPattern, options: .regularExpression) else { return false }
    let host = raw[match].prefix { ![":", "/", "?", "#"].contains($0) }
    let topLevel = host.split(separator: ".").last.map { $0.lowercased() } ?? ""
    return !fileExtensions.contains(topLevel)
  }

  static func parse(_ input: PayloadInput) -> ParsedPayload? {
    let explicit = input.scheme == "http" || input.scheme == "https"
    let bare = !explicit && looksLikeBareHost(input.raw)
    guard explicit || bare else { return nil }
    let raw = input.raw
    guard let web = URLComponents(string: bare ? "https://\(raw)" : raw), let host = web.host, !host.isEmpty,
      web.user == nil, web.password == nil, !(web.encodedHost ?? "").contains("%"),
      !raw.contains("\\"), !raw.contains(" "), !TextSanitizer.containsControls(raw), let url = web.url else {
      return ParsedPayload.text(input)
    }
    let insecure = web.scheme?.lowercased() == "http" ? "http://" : ""
    let displayHost = url.host ?? host
    let summary = insecure + displayHost + web.percentEncodedPath
    return ParsedPayload(kind: .url, title: insecure + displayHost + web.percentEncodedPath, details: url.absoluteString,
      openURL: url, summary: summary)
  }
}

/// Links to other apps, such as `myapp://pay?amount=10`.
enum CustomSchemeParser: PayloadKindParser {
  /// Schemes that run script, read local data, install apps, or open system settings.
  static let blockedSchemes: Set<String> = [
    "javascript", "data", "file", "about", "blob", "intent", "vbscript", "content", "itms-services",
    "x-apple.systempreferences", "prefs", "app-prefs",
  ]

  static func parse(_ input: PayloadInput) -> ParsedPayload? {
    guard !input.scheme.isEmpty else { return nil }
    // "Note: buy milk" parses as scheme "note"; a real link never contains whitespace.
    guard !blockedSchemes.contains(input.scheme), !input.raw.contains(where: \.isWhitespace),
      !TextSanitizer.containsControls(input.raw), input.components?.user == nil, input.components?.password == nil,
      let url = input.components?.url else { return ParsedPayload.text(input) }
    return ParsedPayload(kind: .customScheme, title: input.raw, details: input.raw, openURL: url,
      summary: input.raw)
  }
}
