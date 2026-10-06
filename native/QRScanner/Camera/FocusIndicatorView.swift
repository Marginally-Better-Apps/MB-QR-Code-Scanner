import UIKit

/// The tap-to-focus square. It fades out by itself and hides early when focus resets.
final class FocusIndicatorView: UIView {
  override init(frame: CGRect) {
    super.init(frame: CGRect(x: 0, y: 0, width: 76, height: 76))
    isUserInteractionEnabled = false
    isAccessibilityElement = false
    layer.borderColor = UIColor.systemYellow.cgColor
    layer.borderWidth = 1.5
    layer.cornerRadius = 10
    layer.cornerCurve = .continuous
    alpha = 0
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) is unsupported") }

  func show(at point: CGPoint) {
    // Cancelling the previous animations also cancels its pending fade-out.
    layer.removeAllAnimations()
    center = point
    alpha = 0
    transform = UIAccessibility.isReduceMotionEnabled ? .identity : CGAffineTransform(scaleX: 1.4, y: 1.4)
    UIView.animate(withDuration: 0.25, delay: 0, options: [.curveEaseOut]) {
      self.alpha = 1
      self.transform = .identity
    } completion: { finished in
      guard finished else { return }
      UIView.animate(withDuration: 0.3, delay: 0.7, options: [.curveEaseIn]) {
        self.alpha = 0
      }
    }
  }

  func hide() {
    layer.removeAllAnimations()
    UIView.animate(withDuration: 0.2, delay: 0, options: [.beginFromCurrentState]) {
      self.alpha = 0
    }
  }
}
