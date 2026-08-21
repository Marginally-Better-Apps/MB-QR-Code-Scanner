import CoreGraphics

enum QRPreviewGeometry {
  static func aspectFillBounds(
    normalizedImageBounds: CGRect,
    pixelBufferSize: CGSize,
    previewSize: CGSize
  ) -> CGRect {
    guard
      pixelBufferSize.width > 0,
      pixelBufferSize.height > 0,
      previewSize.width > 0,
      previewSize.height > 0
    else {
      return .zero
    }

    let scale = max(
      previewSize.width / pixelBufferSize.width,
      previewSize.height / pixelBufferSize.height
    )
    let displayedSize = CGSize(
      width: pixelBufferSize.width * scale,
      height: pixelBufferSize.height * scale
    )
    let displayedOrigin = CGPoint(
      x: (previewSize.width - displayedSize.width) / 2,
      y: (previewSize.height - displayedSize.height) / 2
    )

    return CGRect(
      x: displayedOrigin.x + normalizedImageBounds.minX * displayedSize.width,
      y: displayedOrigin.y + normalizedImageBounds.minY * displayedSize.height,
      width: normalizedImageBounds.width * displayedSize.width,
      height: normalizedImageBounds.height * displayedSize.height
    )
  }
}
