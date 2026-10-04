import UIKit

/// Asks iOS whether a code's destination can open, for the schemes the app is allowed to query.
@MainActor enum URLOpenAvailability {
  /// Only schemes in `LSApplicationQueriesSchemes` (otpauth, FIDO) are checked; iOS answers "no" for any other scheme,
  /// so those stay `.unknown` and a failed open is explained after the tap instead.
  static func check(_ payload: ScanPayload) -> OpenAvailability {
    guard PayloadActionRules.queryableScheme(for: payload) != nil, let url = payload.openURL else { return .unknown }
    return UIApplication.shared.canOpenURL(url) ? .available : .unavailable
  }
}
