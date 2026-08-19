const { withAppDelegate, withDangerousMod, withXcodeProject } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

function allowForcedDebugBundling(script) {
  const skipped =
    'if [[ "$CONFIGURATION" = *Debug* && -z "$FORCE_BUNDLING" ]]; then\n  export SKIP_BUNDLING=1\nfi';
  const skippedEscaped =
    'if [[ \\"$CONFIGURATION\\" = *Debug* && -z \\"$FORCE_BUNDLING\\" ]]; then\\n  export SKIP_BUNDLING=1\\nfi';
  const forceRelease = `${skipped}
if [[ -n "$FORCE_BUNDLING" ]]; then
  export CONFIGURATION=Release
fi`;
  const forceReleaseEscaped = `${skippedEscaped}\\nif [[ -n \\"$FORCE_BUNDLING\\" ]]; then\\n  export CONFIGURATION=Release\\nfi`;
  return script
    .replace(
      'if [[ "$CONFIGURATION" = *Debug* ]]; then\n  export SKIP_BUNDLING=1\nfi',
      forceRelease,
    )
    .replace(
      'if [[ \\"$CONFIGURATION\\" = *Debug* ]]; then\\n  export SKIP_BUNDLING=1\\nfi',
      forceReleaseEscaped,
    );
}

function withSpanishInfoPlist(config) {
  config = withDangerousMod(config, [
    'ios',
    async (mod) => {
      const projectName = mod.modRequest.projectName || 'QRScanner';
      const localeDir = path.join(
        mod.modRequest.platformProjectRoot,
        projectName,
        'es.lproj',
      );
      fs.mkdirSync(localeDir, { recursive: true });
      fs.copyFileSync(
        path.join(mod.modRequest.projectRoot, 'locales/es/InfoPlist.strings'),
        path.join(localeDir, 'InfoPlist.strings'),
      );
      return mod;
    },
  ]);

  config = withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const projectName = mod.modRequest.projectName || 'QRScanner';
    const targetUuid = project.getFirstTarget().uuid;
    const resource = `${projectName}/es.lproj/InfoPlist.strings`;
    try {
      project.addResourceFile(resource, { target: targetUuid });
    } catch {
      // Already referenced.
    }

    const phases = project.hash.project.objects.PBXShellScriptBuildPhase || {};
    const already = Object.values(phases).some(
      (phase) =>
        phase &&
        typeof phase.name === 'string' &&
        phase.name.includes('Copy Spanish InfoPlist strings'),
    );
    if (!already) {
      project.addBuildPhase(
        [],
        'PBXShellScriptBuildPhase',
        'Copy Spanish InfoPlist strings',
        targetUuid,
        {
          shellPath: '/bin/sh',
          shellScript: `set -euo pipefail
DEST="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/es.lproj"
mkdir -p "$DEST"
cp "$PROJECT_DIR/${projectName}/es.lproj/InfoPlist.strings" "$DEST/InfoPlist.strings"
`,
        },
      );
    }
    return mod;
  });

  return config;
}

function withForcedDebugBundle(config) {
  return withXcodeProject(config, (mod) => {
    const phases = mod.modResults.hash.project.objects.PBXShellScriptBuildPhase || {};
    for (const phase of Object.values(phases)) {
      if (!phase || typeof phase.shellScript !== 'string') {
        continue;
      }
      if (!phase.shellScript.includes('SKIP_BUNDLING=1')) {
        continue;
      }
      phase.shellScript = allowForcedDebugBundling(phase.shellScript);
    }
    return mod;
  });
}

function withEmbeddedBundleURL(config) {
  return withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== 'swift') {
      return mod;
    }
    const next = mod.modResults.contents.replace(
      /override func bundleURL\(\) -> URL\? \{[\s\S]*?\n  \}/,
      `override func bundleURL() -> URL? {
    if let embedded = Bundle.main.url(forResource: "main", withExtension: "jsbundle") {
      return embedded
    }
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return nil
#endif
  }`,
    );
    if (next === mod.modResults.contents) {
      throw new Error('Failed to patch AppDelegate.bundleURL for embedded JS');
    }
    mod.modResults.contents = next;
    return mod;
  });
}

function withIosScanner(config) {
  config.ios = config.ios ?? {};
  config.ios.infoPlist = config.ios.infoPlist ?? {};
  delete config.ios.infoPlist.UIDesignRequiresCompatibility;
  return withEmbeddedBundleURL(withForcedDebugBundle(withSpanishInfoPlist(config)));
}

module.exports = withIosScanner;
module.exports.allowForcedDebugBundling = allowForcedDebugBundling;
