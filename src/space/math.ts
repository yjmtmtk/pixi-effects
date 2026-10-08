/**
 * Pure 2.5D projection math. No Pixi, no DOM.
 *
 * Coordinates are comp pixels: +x right, +y down, +z toward the viewer
 * (CSS `translateZ` / three.js convention). Rotations are radians here; the
 * DSL speaks degrees and Layer3D converts. Rotation signs match CSS
 * `rotateX()` / `rotateY()` / `rotateZ()`.
 */

export const DEG = Math.PI / 180;
export const DEFAULT_FOV = 40;
export const MIN_FOV = 1;
export const MAX_FOV = 179;
/** A corner with camera-space depth <= NEAR hides the whole layer for that frame. */
export const NEAR = 1;

export interface Vec3 { x: number; y: number; z: number }
export interface Rect { x: number; y: number; width: number; height: number }

export interface LayerTransform {
  x: number; y: number; z: number;
  /** radians */
  rotationX: number; rotationY: number; rotationZ: number;
  scaleX: number; scaleY: number;
  pivotX: number; pivotY: number;
}

export interface CameraState {
  x: number; y: number; z: number;
  lookAtX: number; lookAtY: number; lookAtZ: number;
  /** Vertical field of view, degrees. */
  fov: number;
  /** Depth of field: world z of the focal plane (default 0), and the lens diameter in comp px; 0 = off. */
  focus?: number; aperture?: number;
}

export interface CameraBasis {
  cx: number; cy: number; cz: number;
  /** right */ rx: number; ry: number; rz: number;
  /** down */ dx: number; dy: number; dz: number;
  /** forward */ fx: number; fy: number; fz: number;
  /** focal length in comp pixels */ focal: number;
  halfW: number; halfH: number;
}

export type Corners = [number, number, number, number, number, number, number, number];

export interface ProjectedLayer {
  /** Screen corners in comp pixels: TL, TR, BR, BL as x0,y0,x1,y1,x2,y2,x3,y3. */
  corners: Corners;
  /** Camera-space depth of the layer origin (larger = farther). */
  depth: number;
  visible: boolean;
}

export function clampFov(fov: number): number {
  if (!Number.isFinite(fov)) return DEFAULT_FOV;
  return Math.min(MAX_FOV, Math.max(MIN_FOV, fov));
}

/** Camera distance that makes the z=0 plane map 1:1 to comp pixels. */
export function homeDistance(compHeight: number, fovDeg: number): number {
  return (compHeight / 2) / Math.tan((clampFov(fovDeg) * DEG) / 2);
}

/** The camera used when a composition has none: centred, looking at the z=0 plane. */
export function homeCamera(compW: number, compH: number, fov: number = DEFAULT_FOV): CameraState {
  return {
    x: compW / 2, y: compH / 2, z: homeDistance(compH, fov),
    lookAtX: compW / 2, lookAtY: compH / 2, lookAtZ: 0,
    fov,
  };
}

export function cameraBasis(cam: CameraState, compW: number, compH: number): CameraBasis {
  let fx = cam.lookAtX - cam.x;
  let fy = cam.lookAtY - cam.y;
  let fz = cam.lookAtZ - cam.z;
  let len = Math.hypot(fx, fy, fz);
  if (len < 1e-9) { fx = 0; fy = 0; fz = -1; len = 1; }
  fx /= len; fy /= len; fz /= len;

  // right = normalize(forward × (0,1,0)) = normalize(-fz, 0, fx)
  let rx = -fz;
  const ry = 0;
  let rz = fx;
  const rlen = Math.hypot(rx, rz);
  if (rlen < 1e-9) { rx = 1; rz = 0; } else { rx /= rlen; rz /= rlen; }

  // down = right × forward
  const dx = ry * fz - rz * fy;
  const dy = rz * fx - rx * fz;
  const dz = rx * fy - ry * fx;

  return {
    cx: cam.x, cy: cam.y, cz: cam.z,
    rx, ry, rz, dx, dy, dz, fx, fy, fz,
    focal: (compH / 2) / Math.tan((clampFov(cam.fov) * DEG) / 2),
    halfW: compW / 2, halfH: compH / 2,
  };
}

/** Local layer point (before pivot) to world space: T(x,y,z) · Rz · Ry · Rx · S · T(-pivot). */
export function layerToWorld(t: LayerTransform, px: number, py: number): Vec3 {
  let x = (px - t.pivotX) * t.scaleX;
  let y = (py - t.pivotY) * t.scaleY;
  let z = 0;

  let c = Math.cos(t.rotationX);
  let s = Math.sin(t.rotationX);
  [y, z] = [y * c - z * s, y * s + z * c];

  c = Math.cos(t.rotationY);
  s = Math.sin(t.rotationY);
  [x, z] = [x * c + z * s, -x * s + z * c];

  c = Math.cos(t.rotationZ);
  s = Math.sin(t.rotationZ);
  [x, y] = [x * c - y * s, x * s + y * c];

  return { x: x + t.x, y: y + t.y, z: z + t.z };
}

export function projectPoint(b: CameraBasis, p: Vec3): { x: number; y: number; depth: number } {
  const vx = p.x - b.cx;
  const vy = p.y - b.cy;
  const vz = p.z - b.cz;
  const xc = vx * b.rx + vy * b.ry + vz * b.rz;
  const yc = vx * b.dx + vy * b.dy + vz * b.dz;
  const zc = vx * b.fx + vy * b.fy + vz * b.fz;
  return { x: b.halfW + (b.focal * xc) / zc, y: b.halfH + (b.focal * yc) / zc, depth: zc };
}

export function projectLayer(t: LayerTransform, frame: Rect, b: CameraBasis): ProjectedLayer {
  const pts: Array<[number, number]> = [
    [frame.x, frame.y],
    [frame.x + frame.width, frame.y],
    [frame.x + frame.width, frame.y + frame.height],
    [frame.x, frame.y + frame.height],
  ];
  let visible = true;
  const corners: number[] = [];
  for (const [px, py] of pts) {
    const p = projectPoint(b, layerToWorld(t, px, py));
    if (!(p.depth > NEAR)) visible = false;
    corners.push(p.x, p.y);
  }
  const origin = projectPoint(b, { x: t.x, y: t.y, z: t.z });
  return { corners: corners as Corners, depth: origin.depth, visible };
}
