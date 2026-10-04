import Foundation

/// How a web link is shown so the real destination can't hide behind a long, look-alike host.
struct LinkDisplay: Equatable {
  /// Lowercased host with any port. Shown on its own line and truncated at the head so the registrable domain stays visible.
  let host: String
  /// Path and query, or empty for a bare host.
  let path: String
  /// Plain `http` links, in any letter case, are marked as not secure.
  let isInsecure: Bool

  /// Host and path as one string for VoiceOver and search, matching how the link reads in History.
  var hostAndPath: String { host + path }

  init?(_ payload: ScanPayload) {
    guard payload.kind == .url, let url = payload.openURL else { return nil }
    self.init(url: url)
  }

  init?(url: URL) {
    let scheme = url.scheme?.lowercased()
    guard scheme == "http" || scheme == "https",
      let rawHost = url.host(percentEncoded: true), !rawHost.isEmpty else { return nil }
    let port = url.port.map { ":\($0)" } ?? ""
    host = ScanPayload.visible(rawHost.lowercased() + port, limit: 300)
    var tail = url.path(percentEncoded: true)
    if let query = url.query(percentEncoded: true), !query.isEmpty { tail += "?" + query }
    path = tail == "/" ? "" : ScanPayload.visible(tail, limit: 300)
    isInsecure = scheme == "http"
  }
}
