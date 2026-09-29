import Foundation
import SwiftUI

struct ProductRecord: Decodable {
  let productName: String?
  let brands: String?
  let quantity: String?
  let productType: String?

  enum CodingKeys: String, CodingKey {
    case productName = "product_name", brands, quantity, productType = "product_type"
  }
}

enum ProductLookup {
  private struct Response: Decodable { let status: String; let product: ProductRecord? }

  static func find(_ code: String) async throws -> ProductRecord? {
    guard code.count <= 14, code.allSatisfy({ $0.isASCII && $0.isNumber }) else { return nil }
    guard let url = URL(string: "https://world.openfoodfacts.org/api/v3/product/\(code).json?product_type=all&fields=product_name,brands,quantity,product_type") else { return nil }
    var request = URLRequest(url: url)
    request.timeoutInterval = 12
    request.setValue("QRScanner/1.0 (help@marginally-better.app)", forHTTPHeaderField: "User-Agent")
    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
    if http.statusCode == 404 { return nil }
    guard http.statusCode == 200 else { throw URLError(.badServerResponse) }
    let result = try JSONDecoder().decode(Response.self, from: data)
    return result.status == "success" || result.status == "success_with_errors" ? result.product : nil
  }
}

struct ProductLookupScreen: View {
  let code: String
  @Environment(\.dismiss) private var dismiss
  @State private var product: ProductRecord?
  @State private var loading = true
  @State private var failed = false

  var body: some View {
    NavigationStack {
      Group {
        if loading { ProgressView("Looking up product") }
        else if failed { ContentUnavailableView("Lookup Unavailable", systemImage: "wifi.exclamationmark", description: Text("Check your connection and try again.")) }
        else if let product {
          List {
            LabeledContent("Product", value: product.productName?.isEmpty == false ? product.productName! : "Unnamed product")
            if let brands = product.brands, !brands.isEmpty { LabeledContent("Brand", value: brands) }
            if let quantity = product.quantity, !quantity.isEmpty { LabeledContent("Quantity", value: quantity) }
            if let type = product.productType, !type.isEmpty { LabeledContent("Category", value: type.capitalized) }
            LabeledContent("Barcode", value: code)
            Section { Text("Community product data from Open Food Facts. Check the package for accuracy.") }
          }
        } else {
          ContentUnavailableView("Product Not Found", systemImage: "barcode", description: Text("The code was read, but no product was found in the Open Food Facts databases."))
        }
      }
      .navigationTitle("Product Lookup")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
        if failed { ToolbarItem(placement: .topBarLeading) { Button("Retry") { Task { await lookup() } } } }
      }
    }
    .task(id: code) { await lookup() }
  }

  private func lookup() async {
    loading = true
    failed = false
    do { product = try await ProductLookup.find(code) }
    catch { if !Task.isCancelled { failed = true } }
    loading = false
  }
}
