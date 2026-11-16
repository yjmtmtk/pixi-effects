/**
 * A plain object ({…} or Object.create(null)), made in this window or in another one: an object a page makes and hands to a movie in its iframe
 * (or the other way round) has that window's Object.prototype, so "its prototype is Object.prototype" would refuse it. A plain object's
 * prototype is null or a prototype whose own prototype is null (an Object.prototype, of any window); arrays, Maps, Dates and class instances
 * have a longer chain or another tag.
 */
export function isPlain(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  if (proto === null) return true;
  return Object.getPrototypeOf(proto) === null && Object.prototype.toString.call(v) === '[object Object]';
}
