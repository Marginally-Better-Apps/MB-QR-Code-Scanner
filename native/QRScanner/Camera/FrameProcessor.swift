import AVFoundation
import os

/// Runs Vision on camera frames and hands each result to the main queue.
///
/// AVFoundation calls `captureOutput` on `queue`. The only state shared with other
/// threads is the `FrameThrottle`, which lives behind a lock, so the type is Sendable.
final class FrameProcessor: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate, Sendable {
  let queue = DispatchQueue(label: "com.marginallybetter.qrscanner.vision")
  private let throttle = OSAllocatedUnfairLock(initialState: FrameThrottle())
  private let deliver: @MainActor @Sendable (QRScanFrame?) -> Void

  init(deliver: @escaping @MainActor @Sendable (QRScanFrame?) -> Void) {
    self.deliver = deliver
    super.init()
  }

  func update(lowPowerMode: Bool, thermalState: ProcessInfo.ThermalState) {
    throttle.withLock {
      $0.lowPowerMode = lowPowerMode
      $0.thermalState = thermalState
    }
  }

  func captureOutput(
    _ output: AVCaptureOutput,
    didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    guard
      let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer),
      throttle.withLock({ $0.beginFrame() })
    else {
      return
    }
    let frame = try? QRScanFrame.detect(in: pixelBuffer)
    DispatchQueue.main.async { [deliver, throttle] in
      deliver(frame)
      throttle.withLock { $0.finishDelivery() }
    }
  }
}
