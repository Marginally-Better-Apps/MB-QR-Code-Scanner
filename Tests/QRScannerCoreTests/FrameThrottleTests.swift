import Foundation
import Testing
@testable import QRScannerCore

@Suite struct FrameThrottleTests {
  @Test func nominalConditionsDetectEveryDeliveredFrame() {
    var throttle = FrameThrottle()
    let detected = detectedFrames(&throttle, count: 10)
    #expect(detected == Array(0..<10))
  }

  @Test func coalescesFramesWhileADeliveryIsPending() {
    var throttle = FrameThrottle()
    let first = throttle.beginFrame()
    let whilePending = [throttle.beginFrame(), throttle.beginFrame()]
    #expect(first)
    #expect(throttle.deliveryInFlight)
    #expect(whilePending == [false, false])
    throttle.finishDelivery()
    let afterDelivery = throttle.beginFrame()
    #expect(afterDelivery)
  }

  @Test(arguments: [ProcessInfo.ThermalState.serious, .critical])
  func thermalPressureDetectsOneFrameInFour(_ state: ProcessInfo.ThermalState) {
    var throttle = FrameThrottle()
    throttle.thermalState = state
    let detected = detectedFrames(&throttle, count: 12)
    #expect(detected == [0, 4, 8])
  }

  @Test(arguments: [ProcessInfo.ThermalState.nominal, .fair])
  func mildThermalStatesKeepTheFullRate(_ state: ProcessInfo.ThermalState) {
    var throttle = FrameThrottle()
    throttle.thermalState = state
    let detected = detectedFrames(&throttle, count: 4)
    #expect(!throttle.isReducedRate)
    #expect(detected == [0, 1, 2, 3])
  }

  @Test func lowPowerModeDetectsOneFrameInFourAndRecovers() {
    var throttle = FrameThrottle()
    throttle.lowPowerMode = true
    let reduced = detectedFrames(&throttle, count: 6)
    throttle.lowPowerMode = false
    let recovered = detectedFrames(&throttle, count: 3)
    #expect(reduced == [0, 4])
    #expect(recovered == [0, 1, 2])
  }

  @Test func enteringReducedRateDetectsTheNextFrameImmediately() {
    var throttle = FrameThrottle()
    throttle.lowPowerMode = true
    let lowPower = detectedFrames(&throttle, count: 2)
    throttle.lowPowerMode = false
    throttle.thermalState = .serious
    let thermal = detectedFrames(&throttle, count: 1)
    #expect(lowPower == [0])
    #expect(thermal == [0])
  }

  @Test func overlappingCausesKeepTheStride() {
    var throttle = FrameThrottle()
    throttle.thermalState = .serious
    let thermal = detectedFrames(&throttle, count: 2)
    // Still reduced: Low Power Mode on top of thermal pressure must not restart the count.
    throttle.lowPowerMode = true
    let both = detectedFrames(&throttle, count: 3)
    #expect(thermal == [0])
    #expect(both == [2])
  }

  @Test func coalescedFramesDoNotAdvanceTheReducedStride() {
    var throttle = FrameThrottle()
    throttle.lowPowerMode = true
    let first = throttle.beginFrame()
    let whilePending = throttle.beginFrame()
    throttle.finishDelivery()
    let detected = detectedFrames(&throttle, count: 4)
    #expect(first)
    #expect(!whilePending)
    #expect(detected == [3])
  }

  /// Indices of the frames that ran detection, each delivered before the next arrives.
  private func detectedFrames(_ throttle: inout FrameThrottle, count: Int) -> [Int] {
    var detected: [Int] = []
    for index in 0..<count where throttle.beginFrame() {
      detected.append(index)
      throttle.finishDelivery()
    }
    return detected
  }
}
