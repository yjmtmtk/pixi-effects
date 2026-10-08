// examples/playground/share.js — a share link carries the code in the address (#code=…), packed with deflate-raw and base64url. No server.
export const MAX_DECODED = 204800;

const unb64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export async function encode(code) {
  const stream = new Blob([new TextEncoder().encode(code)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const packed = new Uint8Array(await new Response(stream).arrayBuffer());
  let s = '';
  for (let i = 0; i < packed.length; i += 0x8000) s += String.fromCharCode(...packed.subarray(i, i + 0x8000));   // chunks: a spread of a big array overflows the stack
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The code in a packed text. Broken or oversized input is an error that says what is wrong (nothing is opened). */
export async function decode(text) {
  let bytes;
  try { bytes = unb64url(text); } catch { throw new Error('this link is not valid (it is not a packed pixi-effects code)'); }
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks = []; let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_DECODED) { await reader.cancel(); throw new Error('this link unpacks to something too large (over 200 KB): it was not opened'); }
      chunks.push(value);
    }
  } catch (e) {
    if (/too large/.test(e.message)) throw e;
    throw new Error('this link is not valid (it could not be unpacked)');
  }
  const all = new Uint8Array(total); let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  return new TextDecoder().decode(all);
}

export async function shareUrl(code, base) { return `${base}#code=${await encode(code)}`; }

/** The code of a `#code=…` hash, or null for any other hash. */
export async function codeFromHash(hash) {
  const m = /^#code=([A-Za-z0-9_-]+)$/.exec(hash || '');
  return m ? decode(m[1]) : null;
}
