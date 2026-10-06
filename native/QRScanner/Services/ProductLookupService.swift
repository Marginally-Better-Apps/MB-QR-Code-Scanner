import Foundation

extension OpenFoodFactsClient {
  /// The app's shared client: an ephemeral session with no cache or cookies, identified by the app's version.
  static let live = OpenFoodFactsClient(
    http: EphemeralHTTPClient(timeout: timeout),
    appVersion: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
  )
}
