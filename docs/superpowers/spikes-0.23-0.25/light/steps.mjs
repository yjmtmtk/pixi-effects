// SPIKE 0.24 light: the steps driver.mjs runs.
const W = 640, H = 360;
const plane = (initial, fill = '#cccccc', extra = {}) => ({ type: 'shape', shape: 'rect', name: 'plane', width: 2400, height: 2400, anchorX: 0.5, anchorY: 0.5, threeD: true, ...extra, initial: { fillColor: fill, ...initial } });
const ambient = (intensity, color = '#ffffff') => ({ type: 'light', kind: 'ambient', initial: { intensity, color } });

export const REF_CASES = {
  'A frontal, point, inverseSquare': {
    plane: plane({ x: 320, y: 180, z: 0 }),
    lights: [ambient(0.1), { type: 'light', kind: 'point', falloff: 'inverseSquare', initial: { x: 200, y: 120, z: 300, lookAtX: 320, lookAtY: 180, lookAtZ: 0, color: '#ffd0a0', intensity: 1.2, radius: 400 } }],
  },
  'B frontal, spot cone 40 feather 0.5': {
    plane: plane({ x: 320, y: 180, z: 0 }),
    lights: [ambient(0.05), { type: 'light', kind: 'spot', initial: { x: 320, y: 180, z: 500, lookAtX: 400, lookAtY: 200, lookAtZ: 0, coneAngle: 40, coneFeather: 0.5, intensity: 1 } }],
  },
  'C tilted (rotX -20, rotY 35), point smooth + parallel': {
    plane: plane({ x: 320, y: 180, z: -100, rotationX: -20, rotationY: 35 }, '#cccccc', { width: 900, height: 700 }),
    lights: [ambient(0.1), { type: 'light', kind: 'point', falloff: 'smooth', initial: { x: 150, y: 100, z: 200, lookAtX: 320, lookAtY: 180, lookAtZ: 0, radius: 200, falloffDistance: 600, color: '#a0c0ff' } },
      { type: 'light', kind: 'parallel', initial: { x: 0, y: 0, z: 500, lookAtX: 320, lookAtY: 180, lookAtZ: 0, intensity: 0.5, color: '#ffeedd' } }],
  },
  'D light behind the plane (only ambient 0.2 expected)': {
    plane: plane({ x: 320, y: 180, z: 0 }),
    lights: [ambient(0.2), { type: 'light', kind: 'point', initial: { x: 320, y: 180, z: -300, lookAtX: 320, lookAtY: 180, lookAtZ: 0, intensity: 2 } }],
  },
  'E tilted spot, steep (rotY 60), hard cone (feather 0)': {
    plane: plane({ x: 320, y: 180, z: -200, rotationY: 60 }, '#cccccc', { width: 700, height: 500 }),
    lights: [ambient(0.1), { type: 'light', kind: 'spot', initial: { x: 320, y: 100, z: 300, lookAtX: 250, lookAtY: 180, lookAtZ: -250, coneAngle: 30, coneFeather: 0, intensity: 1.5 } }],
  },
  'F as E with coneFeather 0.15': {
    plane: plane({ x: 320, y: 180, z: -200, rotationY: 60 }, '#cccccc', { width: 700, height: 500 }),
    lights: [ambient(0.1), { type: 'light', kind: 'spot', initial: { x: 320, y: 100, z: 300, lookAtX: 250, lookAtY: 180, lookAtZ: -250, coneAngle: 30, coneFeather: 0.15, intensity: 1.5 } }],
  },
};

const comp =(seqs) => ({ sequences: seqs });

export async function smoke({ cdp, J, out, log }) {
  const c = REF_CASES['A frontal, point, inverseSquare'];
  log('backend', await cdp.eval(`mk(${J({ width: W, height: H, composition: comp([c.plane, ...c.lights]) })})`), await cdp.eval('gpuName()'));
  log('lit layers', await cdp.eval('litCount()'), 'logs', await cdp.eval('__logs'));
  out('smoke.png', await cdp.eval('snap(0)'));
}

export async function ref({ cdp, J, log }) {
  log('backend', await cdp.eval(`mk(${J({ width: W, height: H, composition: comp([plane({ x: 320, y: 180 })]) })})`), await cdp.eval('gpuName()'));
  for (const [name, c] of Object.entries(REF_CASES)) {
    await cdp.eval(`mk(${J({ width: W, height: H, composition: comp([c.plane, ...c.lights]) })})`);
    const r = await cdp.eval(`refCompare(${J({ plane: c.plane, lights: c.lights, albedo: '#cccccc', region: [4, 4, W - 4, H - 4, 3] })})`);
    log(name, '→ max |GPU − JS| =', r.max, '/255; samples > 2/255:', r.over2, 'of', r.n, 'worst', J(r.worst[0]));
  }
  // facing away: D above. Ambient-only white light at intensity 1 must equal the unlit picture (the shader path itself is faithful)
  const scene = [plane({ x: 320, y: 180, z: -50, rotationY: 25 }, '#cccccc'),
    { type: 'text', text: 'Lit = unlit?', threeD: true, style: { fontSize: 64, fill: '#ff8040', fontFamily: 'sans-serif', fontWeight: '700' }, initial: { x: 320, y: 180, z: 40, anchorX: 0.5, anchorY: 0.5, rotationX: 15 } },
    { type: 'shape', shape: 'circle', radius: 60, threeD: true, initial: { x: 120, y: 260, z: 100, fillColor: '#40a0ff', alpha: 0.6 } }];
  await cdp.eval(`mk(${J({ width: W, height: H, composition: comp(scene) })})`);
  const unlit = await cdp.eval('snap(0)');
  await cdp.eval(`mk(${J({ width: W, height: H, composition: comp([...scene, ambient(1)]) })})`);
  const lit = await cdp.eval('snap(0)');
  log('ambient white 1.0 vs no light: max diff', await cdp.eval(`diff(${J(unlit)}, ${J(lit)})`), '(lit layers:', await cdp.eval('litCount()'), ')');
  // fog only (camera keys) — the depth gradient on a floor
  await cdp.eval(`mk(${J({ width: W, height: H, composition: comp([...scene, { type: 'camera', initial: { fogNear: 900, fogFar: 1300, fogColor: '#000000' } }]) })})`);
  log('camera fog makes', await cdp.eval('litCount()'), 'layers use the lit shader; logs', J(await cdp.eval('__logs')));
}

// the room: back wall, floor, a title card that casts a shadow, a sweeping spot, a point light
export function room({ lights = true, fog = false, shadows = true, shadowShot = false, dof = false, W: w = 1280, H: h = 720 } = {}) {
  const sx = w / 1280;
  const L = [];
  if (shadowShot) {
    // one hard-ish spot from the front left aimed at the card: its shadow falls to the right on the wall and back on the floor
    L.push({ type: 'light', kind: 'ambient', initial: { intensity: 0.22, color: '#c8d4ff' } });
    L.push({ type: 'light', kind: 'spot', castsShadows: true, initial: { x: 60 * sx, y: 380, z: 650, lookAtX: 700 * sx, lookAtY: 560, lookAtZ: -450, coneAngle: 55, coneFeather: 0.5, intensity: 1.25, color: '#fff3e0', shadowDarkness: 0.9, shadowDiffusion: 12 } });
  } else if (lights) {
    L.push({ type: 'light', kind: 'ambient', initial: { intensity: 0.18, color: '#c8d4ff' } });
    L.push({ type: 'light', kind: 'spot', name: 'spot', castsShadows: shadows, falloff: 'none',
      initial: { x: 640 * sx, y: -150, z: 500, lookAtX: 250 * sx, lookAtY: 420, lookAtZ: -600, coneAngle: 40, coneFeather: 0.6, intensity: 1.05, color: '#fff1d6', shadowDarkness: 0.85, shadowDiffusion: 18 },
      keyframes: [{ at: 0, to: { lookAtX: 1030 * sx }, duration: 4, ease: 'sine.inOut' }] });
    L.push({ type: 'light', kind: 'point', name: 'key', castsShadows: shadows, falloff: 'inverseSquare',
      initial: { x: 180 * sx, y: 180, z: 420, intensity: 1.0, color: '#ffb070', radius: 700, shadowDarkness: 0.7, shadowDiffusion: 40 },
      keyframes: [{ at: 0, to: { x: 420 * sx, y: 120 }, duration: 4, ease: 'sine.inOut' }] });
  }
  return { sequences: [
    { type: 'camera', initial: { x: 640 * sx, y: 260, z: 1150, lookAtX: 640 * sx, lookAtY: 400, lookAtZ: -250, fov: 40, ...(fog ? { fogNear: 1100, fogFar: 2400, fogColor: '#0a0d18', fogAmount: 0.85 } : {}), ...(dof ? { focus: 'card', aperture: 40 } : {}) } },
    // back wall at z = -600
    { type: 'shape', shape: 'rect', name: 'wall', width: 2800 * sx, height: 1100, anchorX: 0.5, anchorY: 1, threeD: true, initial: { x: 640 * sx, y: 760, z: -600, fillColor: '#b9b2a6' } },
    // floor: rotationX 90 lays it down (local +y goes toward the viewer); its origin is its back edge, where it meets the wall (so it sorts behind the card)
    { type: 'shape', shape: 'rect', name: 'floor', width: 2800 * sx, height: 1500, anchorX: 0.5, anchorY: 0, threeD: true, initial: { x: 640 * sx, y: 760, z: -600, rotationX: 90, fillColor: '#6b5a4a' } },
    // a title card standing on the floor, half way to the wall, turned a little
    { type: 'shape', shape: 'rect', name: 'card', width: 520, height: 300, anchorX: 0.5, anchorY: 1, cornerRadius: 18, threeD: true, castsShadows: true, initial: { x: 560 * sx, y: 760, z: -300, rotationY: 18, fillColor: '#f2efe8' } },
    { type: 'text', name: 'title', text: 'LIGHT', threeD: true, castsShadows: true, style: { fontSize: 150, fill: '#1d2a44', fontFamily: 'Georgia, serif', fontWeight: '700', letterSpacing: 8 }, initial: { x: 560 * sx, y: 610, z: -296, rotationY: 18, anchorX: 0.5, anchorY: 0.5 } },
    { type: 'text', name: 'sub', text: '0.24 · spike', threeD: true, style: { fontSize: 34, fill: '#7a6a58', fontFamily: 'sans-serif' }, initial: { x: 560 * sx, y: 700, z: -296, rotationY: 18, anchorX: 0.5, anchorY: 0.5 } },
    ...L,
  ] };
}

export async function demo({ cdp, J, out, log, webgl }) {
  const tag = webgl ? '-webgl' : '';
  for (const [name, opts] of [['room-lit', {}], ['room-unlit', { lights: false }], ['room-lit-fog', { fog: true }], ['room-lit-noshadow', { shadows: false }], ['room-shadow-shot', { shadowShot: true }], ['room-unlit-fog', { lights: false, fog: true }], ['room-shadow-shot-fog-dof', { shadowShot: true, fog: true, dof: true }]]) {
    await cdp.eval(`mk(${J({ width: 1280, height: 720, duration: 4, composition: room(opts) })})`);
    for (const f of name === 'room-lit' ? [0, 60, 119] : [60]) out(`${name}${tag}-f${f}.png`, await cdp.eval(`snap(${f})`));
    log(name, 'lit layers', await cdp.eval('litCount()'), 'logs', J(await cdp.eval('__logs')));
  }
}

export async function det({ cdp, J, log }) {
  await cdp.eval(`mk(${J({ width: 640, height: 360, duration: 4, composition: room({ W: 640, H: 360, fog: true }) })})`);
  const o = await cdp.eval('orders([0, 13, 27, 40, 55, 71, 88, 104, 119])');
  log('room (2 shadowing lights, sweep, fog): forward vs backward max', o.bwdMax, '; forward vs shuffled max', o.jmpMax);
}

// N lit cards at 1080p, k lights, with / without shadows (2 casters, every light casts)
function perfScene({ n, k, shadows, lights = true }) {
  const hard = shadows === 'hard';
  const seqs = [{ type: 'shape', shape: 'rect', width: 1920 * 1.4, height: 1080 * 1.4, anchorX: 0.5, anchorY: 0.5, threeD: true, initial: { x: 960, y: 540, z: -800, fillColor: '#888888' } }];
  for (let i = 0; i < n - 1; i++) {
    seqs.push({ type: 'shape', shape: 'rect', width: 520, height: 340, anchorX: 0.5, anchorY: 0.5, cornerRadius: 20, threeD: true, castsShadows: shadows && i < 2,
      initial: { x: 200 + (i * 373) % 1520, y: 160 + (i * 211) % 760, z: -600 + (i * 97) % 500, rotationY: (i * 23) % 50 - 25, fillColor: ['#e0d0b0', '#b0d0e0', '#d0b0e0'][i % 3] } });
  }
  if (lights) {
    seqs.push({ type: 'light', kind: 'ambient', initial: { intensity: 0.2 } });
    const kinds = ['spot', 'point', 'point'];
    for (let j = 0; j < k; j++) seqs.push({ type: 'light', kind: kinds[j], castsShadows: shadows, falloff: 'inverseSquare', initial: { x: 300 + j * 600, y: 100, z: 400, lookAtX: 960, lookAtY: 540, lookAtZ: -600, radius: 1200, coneAngle: 60, shadowDiffusion: hard ? 0 : 20 },
      keyframes: [{ at: 0, to: { x: 1600 - j * 300 }, duration: 2 }] });
  }
  return { sequences: seqs };
}

export async function perf({ cdp, J, log }) {
  const N = 60;
  const rows = [];
  for (const n of [5, 20]) {
    await cdp.eval(`mk(${J({ width: 1920, height: 1080, duration: 2, composition: perfScene({ n, k: 0, shadows: false, lights: false }) })})`);
    const base = await cdp.eval(`timeFrames(${N})`);
    rows.push({ n, k: 0, shadows: false, ms: base.toFixed(2), delta: '—' });
    for (const k of [1, 3]) for (const shadows of [false, 'hard', true]) {
      await cdp.eval(`mk(${J({ width: 1920, height: 1080, duration: 2, composition: perfScene({ n, k, shadows }) })})`);
      const ms = await cdp.eval(`timeFrames(${N})`);
      rows.push({ n, k, shadows, ms: ms.toFixed(2), delta: (ms - base).toFixed(2) });
    }
    const fogComp = perfScene({ n, k: 0, shadows: false, lights: false });
    fogComp.sequences.push({ type: 'camera', initial: { fogNear: 2000, fogFar: 4000 } });
    await cdp.eval(`mk(${J({ width: 1920, height: 1080, duration: 2, composition: fogComp })})`);
    const fms = await cdp.eval(`timeFrames(${N})`);
    rows.push({ n, k: 'fog only', shadows: false, ms: fms.toFixed(2), delta: (fms - base).toFixed(2) });
  }
  log('gpu', await cdp.eval('gpuName()'));
  console.table(rows);
}

export async function exportmp4({ cdp, J, log }) {
  await cdp.eval(`mk(${J({ width: 640, height: 360, duration: 2, composition: room({ W: 640, H: 360, fog: true }) })})`);
  const t0 = Date.now();
  const size = await cdp.eval('movie.render({ format: "mp4" }).then(b => b.size)');
  log('mp4 export of the lit room (2 s, 640x360):', size, 'bytes in', Date.now() - t0, 'ms; logs', J(await cdp.eval('__logs')));
}

// WebGPU picture vs WebGL picture of the same frame (files written by `demo` and `demo webgl`)
export async function parity({ cdp, J, log }) {
  const { readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const here = dirname(fileURLToPath(import.meta.url));
  await cdp.eval(`mk(${J({ width: 1280, height: 720 })})`);
  for (const n of ['room-unlit-f60', 'room-lit-noshadow-f60', 'room-lit-f60', 'room-shadow-shot-f60', 'room-lit-fog-f60']) {
    const a = 'data:image/png;base64,' + readFileSync(join(here, `${n}.png`)).toString('base64');
    const b = 'data:image/png;base64,' + readFileSync(join(here, `${n.replace('-f60', '-webgl-f60')}.png`)).toString('base64');
    log(n, 'WebGPU vs WebGL max channel diff', await cdp.eval(`diff(${J(a)}, ${J(b)})`), 'pixels differing > 2/255:', await cdp.eval(`diffCount(${J(a)}, ${J(b)}, 2)`));
  }
}
