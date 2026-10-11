// Small pure helpers of the player bar (time text, pixel to frame, file extension). Not part of the public API: tests/Controller.test.ts imports them from here.

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export function frameToPercent(frame: number, totalFrames: number): number {
  if (totalFrames <= 0) return 0;
  const f = Math.min(Math.max(frame, 0), totalFrames);
  return (f / totalFrames) * 100;
}

export function pxToFrame(clientX: number, rect: { left: number; width: number }, totalFrames: number): number {
  if (rect.width <= 0 || totalFrames <= 0) return 0;
  const ratio = (clientX - rect.left) / rect.width;
  const clamped = Math.min(Math.max(ratio, 0), 1);
  return Math.round(clamped * totalFrames);
}

export function pxToFraction(clientX: number, rect: { left: number; width: number }, inset = 0): number {
  const innerLeft = rect.left + inset;
  const innerWidth = Math.max(0, rect.width - 2 * inset);
  if (innerWidth <= 0) return 0;
  const ratio = (clientX - innerLeft) / innerWidth;
  return Math.min(Math.max(ratio, 0), 1);
}

export function extensionForMimeType(mime: string): string {
  const t = (mime || '').toLowerCase();
  if (t.includes('pdf')) return 'pdf';
  if (t.includes('webm')) return 'webm';
  if (t.includes('quicktime') || t.includes('mov')) return 'mov';
  if (t.includes('matroska') || t.includes('mkv')) return 'mkv';
  return 'mp4';
}
