/** Preference is not proof of the encoder actually used by a WebView. */
export async function chooseVideoConfig(codec, settings, optimized, log, Encoder = globalThis.VideoEncoder) {
  const base = { codec: codec.codec, ...settings };
  if (!(await Encoder.isConfigSupported(base)).supported) return null;
  if (optimized) {
    const preferred = { ...base, hardwareAcceleration: 'prefer-hardware' };
    try {
      const result = await Encoder.isConfigSupported(preferred);
      if (result.supported && result.config?.hardwareAcceleration === 'prefer-hardware') return { ...codec, config: preferred };
      log?.warn('hardware-preference-unavailable-or-ignored');
    } catch { log?.warn('hardware-preference-probe-failed'); }
  }
  return { ...codec, config: base };
}
export function configureVideoEncoder(encoder, config, log) {
  try { encoder.configure(config); return config; }
  catch (error) {
    if (config.hardwareAcceleration !== 'prefer-hardware') throw error;
    const fallback = { ...config }; delete fallback.hardwareAcceleration;
    log?.warn('hardware-configure-fallback');
    encoder.configure(fallback);
    return fallback;
  }
}
