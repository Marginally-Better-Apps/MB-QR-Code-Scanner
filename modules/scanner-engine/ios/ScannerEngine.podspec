Pod::Spec.new do |s|
  s.name           = 'ScannerEngine'
  s.version        = '1.0.0'
  s.summary        = 'VisionKit and AVFoundation QR scanner engines'
  s.description    = 'Native QR capture for QR Scanner'
  s.author         = 'Marginally Better'
  s.homepage       = 'https://github.com/Marginally-Better-Apps/MB-QR-Code-Scanner'
  s.license        = 'UNLICENSED'
  s.platforms      = { :ios => '17.0' }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version = '5.9'
  s.dependency 'ExpoModulesCore'
  s.source_files = '*.swift'
  s.resource_bundles = {
    'ScannerEngineResources' => ['Fixtures/*.png']
  }
  s.frameworks = 'AVFoundation', 'Vision', 'VisionKit', 'UIKit'
end
