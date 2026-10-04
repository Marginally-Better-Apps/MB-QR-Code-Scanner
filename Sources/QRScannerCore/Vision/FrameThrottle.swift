import Foundation

/// Decides which camera frames run Vision. Detection always runs off the main thread;
/// this only bounds the main-queue backlog to one pending delivery and lowers the
/// detection rate under thermal pressure or Low Power Mode.
///
/// Not thread safe: the capture pipeline keeps it behind a lock.
struct FrameThrottle {
  /// Under pressure, 1 in 4 frames runs detection (~7.5 fps from a 30 fps camera).
  static let reducedRateStride = 4

  var lowPowerMode = false {
    didSet { resetStrideIfNeeded(wasReduced: oldValue || Self.isPressured(thermalState)) }
  }

  var thermalState: ProcessInfo.ThermalState = .nominal {
    didSet { resetStrideIfNeeded(wasReduced: lowPowerMode || Self.isPressured(oldValue)) }
  }

  private(set) var deliveryInFlight = false
  private var reducedRateFrame = 0

  var isReducedRate: Bool { lowPowerMode || Self.isPressured(thermalState) }

  /// Returns true when this frame should be detected and delivered. The caller must
  /// call `finishDelivery()` once the result reaches the main queue.
  mutating func beginFrame() -> Bool {
    // Coalesce: newer frames are dropped while the previous delivery is still pending.
    guard !deliveryInFlight else { return false }
    if isReducedRate {
      defer { reducedRateFrame += 1 }
      guard reducedRateFrame % Self.reducedRateStride == 0 else { return false }
    }
    deliveryInFlight = true
    return true
  }

  mutating func finishDelivery() {
    deliveryInFlight = false
  }

  private mutating func resetStrideIfNeeded(wasReduced: Bool) {
    // Entering the reduced rate detects the next frame immediately.
    if wasReduced != isReducedRate { reducedRateFrame = 0 }
  }

  private static func isPressured(_ state: ProcessInfo.ThermalState) -> Bool {
    state == .serious || state == .critical
  }
}
