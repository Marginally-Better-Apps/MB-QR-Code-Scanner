import AVFoundation

/// Owns the camera capture graph: session, device, torch, zoom, focus, and recovery.
///
/// Every session and device call runs on `sessionQueue`, and the mutable session state is
/// touched only there (`observers` only in init and deinit). That confinement is why the
/// type is `@unchecked Sendable`:
/// AVCaptureSession and AVCaptureDevice are not Sendable, but they never leave the queue.
/// The main thread only reads the immutable `session` (for the preview layer) and `device`
/// (for the rotation coordinator).
final class CaptureController: @unchecked Sendable {
  let session = AVCaptureSession()
  let device: AVCaptureDevice

  private let sessionQueue = DispatchQueue(label: "com.marginallybetter.qrscanner.session")
  private let output = AVCaptureVideoDataOutput()
  private let frames: FrameProcessor
  private let onFocusReset: @MainActor @Sendable () -> Void
  private var observers: [NSObjectProtocol] = []

  // Session-queue state.
  private var isConfigured = false
  private var wantsRunning = false
  private var wantsTorch = false
  private var videoRotationAngle: CGFloat?
  private var pinchBaseZoomFactor: CGFloat = 1
  private var retriedRuntimeError = false

  /// Returns nil when the device has no camera. Camera authorization must already be granted.
  init?(
    onFrame: @escaping @MainActor @Sendable (QRScanFrame?) -> Void,
    onFocusReset: @escaping @MainActor @Sendable () -> Void
  ) {
    guard let device = AVCaptureDevice.default(for: .video) else {
      return nil
    }
    self.device = device
    self.onFocusReset = onFocusReset
    frames = FrameProcessor(deliver: onFrame)
    observeNotifications()
  }

  deinit {
    observers.forEach(NotificationCenter.default.removeObserver)
  }

  /// Configures the session on first use, then starts it. `completion` runs on the main
  /// queue once the preview connection exists, so the caller can apply its rotation.
  func start(completion: @escaping @MainActor @Sendable () -> Void) {
    sessionQueue.async { [self] in
      wantsRunning = true
      retriedRuntimeError = false
      guard configureIfNeeded() else {
        return
      }
      applyVideoRotation()
      if !session.isRunning {
        session.startRunning()
      }
      applyTorch()
      DispatchQueue.main.async { completion() }
    }
  }

  func stop() {
    sessionQueue.async { [self] in
      wantsRunning = false
      applyTorch()
      if session.isRunning {
        session.stopRunning()
      }
    }
  }

  func setTorch(_ enabled: Bool) {
    sessionQueue.async { [self] in
      wantsTorch = enabled
      applyTorch()
    }
  }

  /// The angle applies to the video data output so buffers match the preview's orientation.
  func setVideoRotationAngle(_ angle: CGFloat) {
    sessionQueue.async { [self] in
      videoRotationAngle = angle
      applyVideoRotation()
    }
  }

  func beginZoom() {
    sessionQueue.async { [self] in
      pinchBaseZoomFactor = device.videoZoomFactor
    }
  }

  func zoom(by scale: CGFloat) {
    sessionQueue.async { [self] in
      let factor = min(
        device.maxAvailableVideoZoomFactor,
        max(device.minAvailableVideoZoomFactor, pinchBaseZoomFactor * scale)
      )
      withDeviceLock { $0.videoZoomFactor = factor }
    }
  }

  /// Focuses and exposes once at `devicePoint`, then returns to continuous focus when
  /// the scene changes (`subjectAreaDidChangeNotification`).
  func focus(at devicePoint: CGPoint) {
    sessionQueue.async { [self] in
      setFocus(devicePoint, focusMode: .autoFocus, exposureMode: .autoExpose, monitorSubjectArea: true)
    }
  }

  // MARK: Session queue

  private func configureIfNeeded() -> Bool {
    if isConfigured {
      return true
    }
    guard let input = try? AVCaptureDeviceInput(device: device) else {
      return false
    }
    session.beginConfiguration()
    defer { session.commitConfiguration() }
    if session.canSetSessionPreset(.high) {
      session.sessionPreset = .high
    }
    guard session.canAddInput(input) else {
      return false
    }
    session.addInput(input)
    output.alwaysDiscardsLateVideoFrames = true
    output.videoSettings = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    ]
    guard session.canAddOutput(output) else {
      // Leave the session empty so a later start can try again.
      session.removeInput(input)
      return false
    }
    session.addOutput(output)
    output.setSampleBufferDelegate(frames, queue: frames.queue)
    isConfigured = true
    resetFocus()
    return true
  }

  private func applyVideoRotation() {
    guard
      let videoRotationAngle,
      let connection = output.connection(with: .video),
      connection.isVideoRotationAngleSupported(videoRotationAngle)
    else {
      return
    }
    connection.videoRotationAngle = videoRotationAngle
  }

  private func applyTorch() {
    guard device.hasTorch else {
      return
    }
    let mode: AVCaptureDevice.TorchMode = wantsTorch && wantsRunning && session.isRunning ? .on : .off
    // The torch can be briefly unavailable, for example while the device is hot.
    guard
      device.torchMode != mode,
      device.isTorchModeSupported(mode),
      mode == .off || device.isTorchAvailable
    else {
      return
    }
    withDeviceLock { $0.torchMode = mode }
  }

  private func resetFocus() {
    setFocus(
      CGPoint(x: 0.5, y: 0.5),
      focusMode: .continuousAutoFocus,
      exposureMode: .continuousAutoExposure,
      monitorSubjectArea: false
    )
  }

  private func setFocus(
    _ point: CGPoint,
    focusMode: AVCaptureDevice.FocusMode,
    exposureMode: AVCaptureDevice.ExposureMode,
    monitorSubjectArea: Bool
  ) {
    withDeviceLock { device in
      if device.isFocusPointOfInterestSupported, device.isFocusModeSupported(focusMode) {
        device.focusPointOfInterest = point
        device.focusMode = focusMode
      }
      if device.isExposurePointOfInterestSupported, device.isExposureModeSupported(exposureMode) {
        device.exposurePointOfInterest = point
        device.exposureMode = exposureMode
      }
      device.isSubjectAreaChangeMonitoringEnabled = monitorSubjectArea
    }
  }

  /// Device properties may only change while locked. If the lock fails the change is
  /// skipped: mutating an unlocked device raises an Objective-C exception.
  private func withDeviceLock(_ change: (AVCaptureDevice) -> Void) {
    do {
      try device.lockForConfiguration()
    } catch {
      return
    }
    defer { device.unlockForConfiguration() }
    change(device)
  }

  private func handleRuntimeError(_ code: AVError.Code?) {
    guard wantsRunning, !session.isRunning else {
      return
    }
    // A media services reset is always recoverable. Other errors get one retry per
    // `start()`, so a persistent failure cannot loop.
    if code != .mediaServicesWereReset {
      guard !retriedRuntimeError else {
        return
      }
      retriedRuntimeError = true
    }
    session.startRunning()
    applyTorch()
  }

  private func handleInterruptionEnded() {
    // The session resumes by itself after an interruption; restart it if it did not.
    if wantsRunning, !session.isRunning {
      session.startRunning()
    }
    applyTorch()
  }


  // MARK: Notifications

  private func observeNotifications() {
    let center = NotificationCenter.default
    let observe = { [unowned self] (name: Notification.Name, object: AnyObject?, handler: @escaping @Sendable (Notification) -> Void) in
      observers.append(center.addObserver(forName: name, object: object, queue: nil, using: handler))
    }
    observe(AVCaptureSession.runtimeErrorNotification, session) { [weak self] notification in
      let code = (notification.userInfo?[AVCaptureSessionErrorKey] as? AVError)?.code
      guard let self else { return }
      sessionQueue.async { self.handleRuntimeError(code) }
    }
    // The session stops by itself when interrupted (another app takes the camera, iPad
    // multitasking, system pressure); only the end of an interruption needs handling.
    observe(AVCaptureSession.interruptionEndedNotification, session) { [weak self] _ in
      guard let self else { return }
      sessionQueue.async { self.handleInterruptionEnded() }
    }
    observe(AVCaptureDevice.subjectAreaDidChangeNotification, device) { [weak self] _ in
      guard let self else { return }
      sessionQueue.async { self.resetFocus() }
      let onFocusReset = onFocusReset
      DispatchQueue.main.async { onFocusReset() }
    }
    let frames = frames
    let refreshThrottle: @Sendable () -> Void = {
      frames.update(
        lowPowerMode: ProcessInfo.processInfo.isLowPowerModeEnabled,
        thermalState: ProcessInfo.processInfo.thermalState
      )
    }
    observe(.NSProcessInfoPowerStateDidChange, nil) { _ in refreshThrottle() }
    observe(ProcessInfo.thermalStateDidChangeNotification, nil) { _ in refreshThrottle() }
    refreshThrottle()
  }
}
