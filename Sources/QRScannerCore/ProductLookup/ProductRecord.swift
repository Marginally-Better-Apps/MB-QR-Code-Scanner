import Foundation

/// The few community-supplied product fields shown after a lookup.
struct ProductRecord: Decodable, Equatable, Sendable {
  let productName: String?
  let brands: String?
  let quantity: String?
  let productType: String?

  enum CodingKeys: String, CodingKey {
    case productName = "product_name", brands, quantity, productType = "product_type"
  }

  init(productName: String? = nil, brands: String? = nil, quantity: String? = nil, productType: String? = nil) {
    self.productName = productName
    self.brands = brands
    self.quantity = quantity
    self.productType = productType
  }

  /// Fields are trimmed and sanitized; empty ones become nil.
  var name: String? { Self.field(productName) }
  var brand: String? { Self.field(brands) }
  var size: String? { Self.field(quantity) }
  var category: String? { Self.field(productType)?.capitalized }

  private static func field(_ value: String?) -> String? {
    guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else { return nil }
    return ScanPayload.visible(trimmed, limit: 200)
  }
}
