/** خروجی ویدیو — R5 پیاده می‌شود (WebCodecs + mp4-muxer).
 *  فعلاً فقط برآورد می‌دهد تا پوستهٔ خروجی کار کند. */
export function estimateSize(project, { fps = 30, bitrateMbps = 12 } = {}) {
  const seconds = project.duration;
  return { seconds, estMB: +(seconds * bitrateMbps / 8).toFixed(1), fps };
}

export async function exportVideo() {
  throw new Error('خروجی ویدیو در فاز R5 می‌آید');
}
