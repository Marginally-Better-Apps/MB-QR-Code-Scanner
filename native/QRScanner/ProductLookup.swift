import SwiftUI

struct ProductLookupScreen: View {
  /// A GTIN from `CodeFormat.productCode`, already validated as digits with a correct check digit.
  let code: String
  var client: OpenFoodFactsClient = .live
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
            LabeledContent("Product", value: product.name ?? String(localized: "Unnamed product"))
            if let brand = product.brand { LabeledContent("Brand", value: brand) }
            if let size = product.size { LabeledContent("Quantity", value: size) }
            if let category = product.category { LabeledContent("Category", value: category) }
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
    do { product = try await client.find(code) }
    catch { if !Task.isCancelled { failed = true } }
    loading = false
  }
}
