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
      return LinkRedaction.textFallback(input)
    }
    let insecure = web.scheme?.lowercased() == "http" ? "http://" : ""
    let displayHost = url.host ?? host
    let redaction = LinkRedaction.historyForm(input.original)
    let summary = insecure + displayHost + (redaction.keepsPath ? web.percentEncodedPath : "")
    return ParsedPayload(kind: .url, title: insecure + displayHost + web.percentEncodedPath, details: url.absoluteString,
      openURL: url, summary: summary, historyOriginal: redaction.value)
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
      let url = input.components?.url else { return LinkRedaction.textFallback(input) }
    let redaction = LinkRedaction.historyForm(input.original)
    return ParsedPayload(kind: .customScheme, title: input.raw, details: input.raw, openURL: url,
      summary: redaction.value, historyOriginal: redaction.value)
  }
}

/// What History stores for a link, so sign-in and reset links don't leave credentials on disk.
///
/// Rule: if any query or fragment parameter name contains a credential-like word (see
/// `sensitiveKeyWords`), or the query or fragment contains a JWT, History stores the link
/// without its query and fragment. If the path contains a JWT, only the scheme and host are
/// kept (only the scheme if the JWT is in the host). Matching is by substring, so `author` or `zipcode` are also dropped; that only
/// shortens the saved link. Live results keep the full link so it still opens.
enum LinkRedaction {
  static let sensitiveKeyWords = [
    "token", "code", "key", "secret", "password", "passwd", "pwd", "auth", "session", "sid", "sig",
    "otp", "reset", "jwt", "nonce", "ticket", "credential", "login", "magic", "invite", "verif", "hash",
  ]

  struct HistoryForm: Equatable {
    let value: String
    let keepsPath: Bool
  }

  /// A malformed link shown as plain text is still saved without its password or credential parameters.
  static func textFallback(_ input: PayloadInput) -> ParsedPayload {
    let saved = historyForm(withoutUserInfo(input.original)).value
    return ParsedPayload(kind: .text, title: input.raw, details: input.raw, summary: saved, historyOriginal: saved)
  }

  /// Drops `user:password@` from a link's authority.
  static func withoutUserInfo(_ link: String) -> String {
    guard let schemeEnd = link.range(of: "://") else { return link }
    let authorityEnd = link[schemeEnd.upperBound...].firstIndex { "/?#".contains($0) } ?? link.endIndex
    guard let at = link[schemeEnd.upperBound..<authorityEnd].lastIndex(of: "@") else { return link }
    return String(link[..<schemeEnd.upperBound]) + String(link[link.index(after: at)...])
  }

  static func historyForm(_ link: String) -> HistoryForm {
    let afterScheme = link.range(of: "://").map(\.upperBound) ?? link.startIndex
    let queryStart = link[afterScheme...].firstIndex { $0 == "?" || $0 == "#" } ?? link.endIndex
    let pathStart = link[afterScheme..<queryStart].firstIndex(of: "/") ?? queryStart
    let path = link[pathStart..<queryStart], tail = link[queryStart...]
    if SecretParser.containsJWT(String(link[afterScheme..<pathStart])), let colon = link.firstIndex(of: ":") {
      return HistoryForm(value: String(link[...colon]), keepsPath: false)
    }
    if SecretParser.containsJWT(String(path)) {
      return HistoryForm(value: String(link[..<pathStart]), keepsPath: false)
    }
    if !tail.isEmpty, hasSensitiveParameter(String(tail)) || SecretParser.containsJWT(String(tail)) {
      return HistoryForm(value: String(link[..<queryStart]), keepsPath: true)
    }
    return HistoryForm(value: link, keepsPath: true)
  }

  /// Checks every `name=value` in a query and fragment, separated by `&`, `;`, `?`, or `#`.
  static func hasSensitiveParameter(_ tail: String) -> Bool {
    tail.split { "&;?#".contains($0) }.contains { parameter in
      let name = (parameter.split(separator: "=", maxSplits: 1).first.map(String.init) ?? "")
      let decoded = (name.removingPercentEncoding ?? name).lowercased()
      return sensitiveKeyWords.contains { decoded.contains($0) }
    }
  }
}
