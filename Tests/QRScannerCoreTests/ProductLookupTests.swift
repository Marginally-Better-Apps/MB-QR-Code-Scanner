import Foundation
import Testing
@testable import QRScannerCore

private final class StubHTTPClient: HTTPClient, @unchecked Sendable {
  let status: Int
  let body: Data
  let error: Error?
  private(set) var requests: [URLRequest] = []

  init(status: Int = 200, body: String = "", error: Error? = nil) {
    self.status = status
    self.body = Data(body.utf8)
    self.error = error
  }

  init(status: Int, data: Data) {
    self.status = status
    body = data
    error = nil
  }

  func data(for request: URLRequest, maxBytes: Int) async throws -> (Data, HTTPURLResponse) {
    requests.append(request)
    if let error { throw error }
    let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: nil)!
    return (body, response)
  }
}

private let found = #"{"code":"3017620422003","status":"success","product":{"product_name":"Nutella","brands":"Ferrero","quantity":"400 g","product_type":"food"}}"#

@Test func lookupRequestIdentifiesTheAppAndAsksOnlyForShownFields() async throws {
  let stub = StubHTTPClient(body: found)
  let client = OpenFoodFactsClient(http: stub, appVersion: "2.3.1")
  _ = try await client.find("3017620422003")
  let request = try #require(stub.requests.first)
  #expect(request.url?.absoluteString == "https://world.openfoodfacts.org/api/v3/product/3017620422003.json?product_type=all&fields=product_name,brands,quantity,product_type")
  #expect(request.value(forHTTPHeaderField: "User-Agent") == "QRScanner/2.3.1 (help@marginally-better.app)")
  #expect(request.timeoutInterval == OpenFoodFactsClient.timeout)
  #expect(OpenFoodFactsClient.userAgent(appVersion: "") == "QRScanner/1.0 (help@marginally-better.app)")
}

@Test func foundProductsDecode() async throws {
  let product = try await OpenFoodFactsClient(http: StubHTTPClient(body: found), appVersion: "1").find("3017620422003")
  #expect(product == ProductRecord(productName: "Nutella", brands: "Ferrero", quantity: "400 g", productType: "food"))
  #expect(product?.category == "Food")
}

@Test func normalizedCodesWithWarningsAreStillFound() async throws {
  let body = #"{"code":"0049000028911","status":"success_with_warnings","warnings":[{"message":{"id":"different_normalized_product_code"}}],"product":{"product_name":"Coca-Cola"}}"#
  let product = try await OpenFoodFactsClient(http: StubHTTPClient(body: body), appVersion: "1").find("049000028911")
  #expect(product?.name == "Coca-Cola")
}

@Test func productsWithErrorsAreStillFound() async throws {
  let body = #"{"status":"success_with_errors","errors":[{}],"product":{"brands":"  Acme  "}}"#
  let product = try await OpenFoodFactsClient(http: StubHTTPClient(body: body), appVersion: "1").find("4006381333931")
  #expect(product != nil)
  #expect(product?.name == nil)
  #expect(product?.brand == "Acme")
}

@Test func missingProductsAreNotFound() async throws {
  let notFound = #"{"code":"4006381333931","status":"failure","result":{"id":"product_not_found"}}"#
  #expect(try await OpenFoodFactsClient(http: StubHTTPClient(status: 404, body: notFound), appVersion: "1").find("4006381333931") == nil)
  #expect(try await OpenFoodFactsClient(http: StubHTTPClient(status: 200, body: notFound), appVersion: "1").find("4006381333931") == nil)
  #expect(try await OpenFoodFactsClient(http: StubHTTPClient(status: 200, body: #"{"status":"success"}"#), appVersion: "1").find("4006381333931") == nil)
}

@Test func failedLookupsThrow() async {
  await #expect(throws: ProductLookupError.badStatus(503)) {
    try await OpenFoodFactsClient(http: StubHTTPClient(status: 503, body: "busy"), appVersion: "1").find("4006381333931")
  }
  await #expect(throws: ProductLookupError.malformedResponse) {
    try await OpenFoodFactsClient(http: StubHTTPClient(body: "<html>"), appVersion: "1").find("4006381333931")
  }
  await #expect(throws: URLError.self) {
    try await OpenFoodFactsClient(http: StubHTTPClient(error: URLError(.timedOut)), appVersion: "1").find("4006381333931")
  }
}

@Test func oversizedResponsesAreRejected() async {
  let huge = Data(repeating: UInt8(ascii: " "), count: OpenFoodFactsClient.maxResponseBytes + 1)
  await #expect(throws: ProductLookupError.responseTooLarge) {
    try await OpenFoodFactsClient(http: StubHTTPClient(status: 200, data: huge), appVersion: "1").find("4006381333931")
  }
}
