import Foundation

/// The single network call product lookup needs, injectable so lookups can be tested without a network.
protocol HTTPClient: Sendable {
  /// Fetches `request`, failing with `ProductLookupError.responseTooLarge` once the body exceeds `maxBytes`.
  func data(for request: URLRequest, maxBytes: Int) async throws -> (Data, HTTPURLResponse)
}

/// A URLSession client that keeps no cookies, credentials, or response cache, so lookups leave nothing in Library/Caches.
final class EphemeralHTTPClient: HTTPClient {
  private let session: URLSession

  init(timeout: TimeInterval = 12) {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.urlCache = nil
    configuration.httpCookieStorage = nil
    configuration.httpShouldSetCookies = false
    configuration.urlCredentialStorage = nil
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    configuration.timeoutIntervalForRequest = timeout
    configuration.timeoutIntervalForResource = timeout * 2
    configuration.waitsForConnectivity = false
    session = URLSession(configuration: configuration)
  }

  deinit { session.finishTasksAndInvalidate() }

  func data(for request: URLRequest, maxBytes: Int) async throws -> (Data, HTTPURLResponse) {
    let (bytes, response) = try await session.bytes(for: request)
    guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
    if http.expectedContentLength > Int64(maxBytes) { throw ProductLookupError.responseTooLarge }
    var data = Data()
    data.reserveCapacity(min(max(Int(http.expectedContentLength), 0), maxBytes))
    for try await byte in bytes {
      data.append(byte)
      if data.count > maxBytes { throw ProductLookupError.responseTooLarge }
    }
    return (data, http)
  }
}
