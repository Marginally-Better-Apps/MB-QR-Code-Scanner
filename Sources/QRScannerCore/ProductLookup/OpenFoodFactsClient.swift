import Foundation

enum ProductLookupError: Error, Equatable {
  case badStatus(Int)
  case responseTooLarge
  case malformedResponse
}

/// Looks up a validated retail barcode across the Open Food Facts product databases.
struct OpenFoodFactsClient: Sendable {
  static let maxResponseBytes = 256 * 1024
  static let timeout: TimeInterval = 12
  /// Open Food Facts asks every app to identify itself with a contact address.
  static let contact = "help@marginally-better.app"

  private struct Response: Decodable {
    let status: String?
    let product: ProductRecord?
  }

  let http: HTTPClient
  let userAgent: String

  init(http: HTTPClient, appVersion: String) {
    self.http = http
    userAgent = Self.userAgent(appVersion: appVersion)
  }

  static func userAgent(appVersion: String) -> String {
    let version = appVersion.trimmingCharacters(in: .whitespacesAndNewlines)
    return "QRScanner/\(version.isEmpty ? "1.0" : version) (\(contact))"
  }

  /// `code` must come from `CodeFormat.productCode`, which guarantees a check-digit-valid GTIN of digits only.
  func request(for code: String) -> URLRequest? {
    var components = URLComponents()
    components.scheme = "https"
    components.host = "world.openfoodfacts.org"
    components.path = "/api/v3/product/\(code).json"
    components.queryItems = [
      URLQueryItem(name: "product_type", value: "all"),
      URLQueryItem(name: "fields", value: "product_name,brands,quantity,product_type"),
    ]
    guard let url = components.url else { return nil }
    var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: Self.timeout)
    request.setValue(userAgent, forHTTPHeaderField: "User-Agent")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    return request
  }

  /// Returns nil when no database has the product; throws when the lookup itself failed.
  func find(_ code: String) async throws -> ProductRecord? {
    guard let request = request(for: code) else { return nil }
    let (data, response) = try await http.data(for: request, maxBytes: Self.maxResponseBytes)
    return try Self.product(from: data, statusCode: response.statusCode)
  }

  static func product(from data: Data, statusCode: Int) throws -> ProductRecord? {
    if statusCode == 404 { return nil }
    guard statusCode == 200 else { throw ProductLookupError.badStatus(statusCode) }
    guard data.count <= maxResponseBytes else { throw ProductLookupError.responseTooLarge }
    let response: Response
    do { response = try JSONDecoder().decode(Response.self, from: data) }
    catch { throw ProductLookupError.malformedResponse }
    // "success", "success_with_warnings" (non-13-digit codes are normalized), and "success_with_errors" all carry a product.
    if let status = response.status, !status.lowercased().hasPrefix("success") { return nil }
    return response.product
  }
}
