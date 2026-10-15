#!/usr/bin/env bash
# CI infrastructure only. Never delete app data, SDK platforms, Java, or signing keys.
set -euo pipefail
MODE="${1:-check}"
AVD_DIR="${ANDROID_AVD_HOME:-${HOME}/.android/avd}"
MIN_FREE_MIB=10240

check_space() {
  mkdir -p "$AVD_DIR"
  df -h "$AVD_DIR"
  local free
  free=$(df -Pm "$AVD_DIR" | awk 'NR == 2 {print $4}')
  if [[ ! "$free" =~ ^[0-9]+$ ]]; then
    echo '::error::Unable to measure emulator disk space.'
    return 1
  fi
  if (( free < MIN_FREE_MIB )); then
    echo "::error::Emulator host has ${free} MiB free; at least ${MIN_FREE_MIB} MiB is required for the system image userdata and test-build overhead."
    return 1
  fi
  echo "Emulator disk check passed: ${free} MiB free."
}

if [[ "$MODE" == check ]]; then
  check_space
  exit 0
fi
if [[ "$MODE" != prepare ]]; then
  echo 'Usage: prepare-emulator-host.sh prepare|check' >&2
  exit 2
fi
# Cleanup is deliberately restricted to ephemeral hosted Linux CI runners.
if [[ "${GITHUB_ACTIONS:-}" != true || "${RUNNER_ENVIRONMENT:-}" != github-hosted || "${RUNNER_OS:-}" != Linux ]]; then
  echo '::error::Runner cleanup is allowed only on GitHub-hosted Linux runners.'
  exit 1
fi
SDK_DIR="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "$SDK_DIR" || "$SDK_DIR" != /* || "$SDK_DIR" == / ]]; then
  echo '::error::Missing or invalid Android SDK path.'
  exit 1
fi
# emulator-runner adds this directory to PATH only after this preparation step.
SDK_MANAGER="$SDK_DIR/cmdline-tools/latest/bin/sdkmanager"
if [[ ! -x "$SDK_MANAGER" ]]; then
  SDK_MANAGER="$(command -v sdkmanager || true)"
fi
if [[ -z "$SDK_MANAGER" || ! -x "$SDK_MANAGER" ]]; then
  echo '::error::Android command-line tools (sdkmanager) are unavailable.'
  exit 1
fi
mkdir -p "$AVD_DIR"
echo 'Disk space before removing unused hosted-runner toolchains:'
df -h "$AVD_DIR"
# These toolchains are unrelated to this Java/JavaScript Android build.
for directory in /usr/share/dotnet /opt/ghc /usr/local/.ghcup /usr/local/share/powershell; do
  if [[ -d "$directory" ]]; then
    echo "Removing unused runner toolchain: $directory"
    sudo -n rm -rf -- "$directory"
  fi
done
# The current project uses WebAssembly, not an Android C/C++ build. Retain NDK
# if any app or Capacitor Gradle script declares a native-build configuration.
NATIVE_BUILD=false
for project in android node_modules/@capacitor/android; do
  if [[ -d "$project" ]] && grep -REq --include='*.gradle' --include='*.gradle.kts' \
      'externalNativeBuild|ndkVersion|ndkPath|ndkBuild|cmake' "$project"; then
    NATIVE_BUILD=true
  fi
done
if [[ "$NATIVE_BUILD" == false && -d "$SDK_DIR/ndk" ]]; then
  echo 'Removing unused runner Android NDK (no native-build configuration found).'
  sudo -n rm -rf -- "$SDK_DIR/ndk"
fi
# Install the large image BEFORE checking space and entering emulator-runner.
# That action executes hook lines in separate shells and catches hook failures
# without stopping launch; a normal Actions run step avoids both problems.
# Process substitution preserves sdkmanager's exit code without yes/SIGPIPE.
"$SDK_MANAGER" --licenses < <(yes) >/dev/null
"$SDK_MANAGER" --install 'build-tools;37.0.0' 'platform-tools' 'emulator' 'platforms;android-30' \
  'system-images;android-30;google_apis;x86_64'
check_space
