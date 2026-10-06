import CoreLocation
import MapKit
import Observation
import UIKit

/// One foreground fix per scan batch, with a short-lived place cache. Never starts continuous tracking.
@MainActor @Observable
final class SystemScanLocation: NSObject, CLLocationManagerDelegate, ScanLocating {
  var enabled: Bool {
    didSet {
      defaults.set(enabled, forKey: "saveScanLocation")
      if enabled {
        if manager.authorizationStatus == .notDetermined { manager.requestWhenInUseAuthorization() }
      } else {
        cached = nil
        finish(nil)
      }
    }
  }
  private(set) var accessDenied = false
  @ObservationIgnored private let defaults: UserDefaults
  @ObservationIgnored private let manager = CLLocationManager()
  @ObservationIgnored private var pending: CheckedContinuation<CLLocation?, Never>?
  @ObservationIgnored private var timeout: Task<Void, Never>?
  @ObservationIgnored private var request: Task<ScanLocation?, Never>?
  @ObservationIgnored private var cached: ScanLocation?

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    enabled = defaults.bool(forKey: "saveScanLocation")
    super.init()
    manager.delegate = self
    manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    refreshAuthorization()
  }

  func location(at date: Date) async -> ScanLocation? {
    guard enabled, UIApplication.shared.applicationState != .background else { return nil }
    refreshAuthorization()
    if manager.authorizationStatus == .notDetermined { manager.requestWhenInUseAuthorization() }
    guard manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways else { return nil }
    if let cached, cached.isUsable(at: date) { return cached }
    if let request { return await request.value }
    let work = Task { [weak self] () -> ScanLocation? in
      guard let self, let fix = await self.fetchFix(), self.enabled,
        UIApplication.shared.applicationState != .background,
        fix.horizontalAccuracy >= 0, fix.horizontalAccuracy <= 50_000,
        abs(fix.timestamp.timeIntervalSince(date)) <= 60 else { return nil }
      let placeName = await self.placeName(for: fix)
      guard self.enabled, UIApplication.shared.applicationState != .background else { return nil }
      let result = ScanLocation(latitude: fix.coordinate.latitude, longitude: fix.coordinate.longitude,
        placeName: placeName, capturedAt: fix.timestamp)
      self.cached = result
      return result
    }
    request = work
    let result = await work.value
    request = nil
    return result
  }

  private func placeName(for fix: CLLocation) async -> String? {
    if #available(iOS 26.0, *) {
      guard let lookup = MKReverseGeocodingRequest(location: fix) else { return nil }
      let timeout = Task {
        do { try await Task.sleep(for: .seconds(8)) } catch { return }
        lookup.cancel()
      }
      defer { timeout.cancel() }
      let items = try? await lookup.mapItems
      return items?.first?.address?.fullAddress
    } else {
      return await legacyPlaceName(for: fix)
    }
  }

  @available(iOS, introduced: 17.0, deprecated: 26.0)
  private func legacyPlaceName(for fix: CLLocation) async -> String? {
    let geocoder = CLGeocoder()
    let timeout = Task {
      do { try await Task.sleep(for: .seconds(8)) } catch { return }
      geocoder.cancelGeocode()
    }
    defer { timeout.cancel() }
    let place = try? await geocoder.reverseGeocodeLocation(fix).first
    var parts: [String] = []
    let name = fix.horizontalAccuracy <= 1_000 ? place?.name : nil
    for value in [name, place?.locality, place?.administrativeArea, place?.country].compactMap({ $0 }) {
      if !parts.contains(value) { parts.append(value) }
    }
    return parts.isEmpty ? nil : parts.joined(separator: ", ")
  }

  private func fetchFix() async -> CLLocation? {
    await withCheckedContinuation { continuation in
      pending = continuation
      timeout = Task { [weak self] in
        do { try await Task.sleep(for: .seconds(10)) } catch { return }
        self?.finish(nil)
      }
      manager.requestLocation()
    }
  }

  private func finish(_ fix: CLLocation?) {
    timeout?.cancel()
    timeout = nil
    let continuation = pending
    pending = nil
    continuation?.resume(returning: fix)
  }

  private func refreshAuthorization() {
    accessDenied = manager.authorizationStatus == .denied || manager.authorizationStatus == .restricted
    if accessDenied { cached = nil; finish(nil) }
  }

  nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    Task { @MainActor [weak self] in self?.refreshAuthorization() }
  }
  nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    let fix = locations.last
    Task { @MainActor [weak self] in self?.finish(fix) }
  }
  nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    Task { @MainActor [weak self] in self?.finish(nil) }
  }
}
