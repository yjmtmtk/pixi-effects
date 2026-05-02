/**
 * Tiny expression parser for the pixi-effects DSL.
 *
 * Supported grammar (recursive descent, LL(1)):
 *   expr      = additive
 *   additive  = multiplicative (('+'|'-') multiplicative)*
 *   multiplicative = unary (('*'|'/') unary)*
 *   unary     = ('-'|'+') unary | primary
 *   primary   = number | identifier ('(' (expr (',' expr)*)? ')')? | '(' expr ')'
 *
 * Numbers are parsed via parseFloat (decimals OK). Identifiers map to keys in
 * the supplied scope. A small fixed function set is exposed: see FUNCS below.
 *
 * Parsed ASTs are cached per source string. CSP-safe: no Function constructor.
 */
const FUNCS: Record<string, (...args: number[]) => number> = {
  min: Math.min,
  max: Math.max,
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sqrt: Math.sqrt,
  pow: Math.pow,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
};

type BinOp = '+' | '-' | '*' | '/';
type Token =
  | { type: 'num'; value: number }
  | { type: 'id'; name: string }
  | { type: 'op'; op: BinOp }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'comma' };

type Node =
  | { kind: 'num'; value: number }
  | { kind: 'var'; name: string }
  | { kind: 'neg'; child: Node }
  | { kind: 'bin'; op: BinOp; left: Node; right: Node }
  | { kind: 'call'; name: string; args: Node[] };

function isDigit(c: string): boolean { return c >= '0' && c <= '9'; }
function isIdStart(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
}
function isIdCont(c: string): boolean { return isIdStart(c) || isDigit(c); }

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < src.length;) {
    const c = src[i]!;
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] ?? ''))) {
      let j = i + 1;
      while (j < src.length && (isDigit(src[j]!) || src[j] === '.')) j++;
      const value = parseFloat(src.slice(i, j));
      if (Number.isNaN(value)) throw new Error(`bad number at ${i}`);
      out.push({ type: 'num', value });
      i = j;
      continue;
    }
    if (isIdStart(c)) {
      let j = i + 1;
      while (j < src.length && isIdCont(src[j]!)) j++;
      out.push({ type: 'id', name: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === '+' || c === '-' || c === '*' || c === '/') {
      out.push({ type: 'op', op: c });
      i++;
      continue;
    }
    if (c === '(') { out.push({ type: 'lparen' }); i++; continue; }
    if (c === ')') { out.push({ type: 'rparen' }); i++; continue; }
    if (c === ',') { out.push({ type: 'comma' }); i++; continue; }
    throw new Error(`unexpected character "${c}" at ${i}`);
  }
  return out;
}

class Cursor {
  i = 0;
  constructor(public tokens: Token[]) {}
  peek(): Token | undefined { return this.tokens[this.i]; }
  next(): Token | undefined { return this.tokens[this.i++]; }
}

function parseExpr(c: Cursor): Node { return parseAdd(c); }

function parseAdd(c: Cursor): Node {
  let node = parseMul(c);
  for (;;) {
    const t = c.peek();
    if (t?.type !== 'op' || (t.op !== '+' && t.op !== '-')) break;
    c.next();
    node = { kind: 'bin', op: t.op, left: node, right: parseMul(c) };
  }
  return node;
}

function parseMul(c: Cursor): Node {
  let node = parseUnary(c);
  for (;;) {
    const t = c.peek();
    if (t?.type !== 'op' || (t.op !== '*' && t.op !== '/')) break;
    c.next();
    node = { kind: 'bin', op: t.op, left: node, right: parseUnary(c) };
  }
  return node;
}

function parseUnary(c: Cursor): Node {
  const t = c.peek();
  if (t?.type === 'op' && t.op === '-') { c.next(); return { kind: 'neg', child: parseUnary(c) }; }
  if (t?.type === 'op' && t.op === '+') { c.next(); return parseUnary(c); }
  return parsePrimary(c);
}

function parsePrimary(c: Cursor): Node {
  const t = c.next();
  if (!t) throw new Error('unexpected end of expression');
  if (t.type === 'num') return { kind: 'num', value: t.value };
  if (t.type === 'lparen') {
    const node = parseExpr(c);
    const close = c.next();
    if (close?.type !== 'rparen') throw new Error('expected ")"');
    return node;
  }
  if (t.type === 'id') {
    if (c.peek()?.type === 'lparen') {
      c.next();
      const args: Node[] = [];
      if (c.peek()?.type !== 'rparen') {
        args.push(parseExpr(c));
        while (c.peek()?.type === 'comma') { c.next(); args.push(parseExpr(c)); }
      }
      const close = c.next();
      if (close?.type !== 'rparen') throw new Error('expected ")"');
      return { kind: 'call', name: t.name, args };
    }
    return { kind: 'var', name: t.name };
  }
  throw new Error(`unexpected token "${t.type}"`);
}

function parse(src: string): Node {
  const c = new Cursor(tokenize(src));
  const node = parseExpr(c);
  if (c.peek()) throw new Error('trailing input');
  return node;
}

function evalNode(node: Node, scope: Record<string, number>): number {
  switch (node.kind) {
    case 'num': return node.value;
    case 'var': {
      const v = scope[node.name];
      if (typeof v !== 'number') throw new Error(`undefined variable: ${node.name}`);
      return v;
    }
    case 'neg': return -evalNode(node.child, scope);
    case 'bin': {
      const l = evalNode(node.left, scope);
      const r = evalNode(node.right, scope);
      switch (node.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return l / r;
      }
    }
    /* c8 ignore next 5 */
    // eslint-disable-next-line no-fallthrough
    case 'call': {
      const fn = FUNCS[node.name];
      if (!fn) throw new Error(`unknown function: ${node.name}`);
      return fn(...node.args.map(a => evalNode(a, scope)));
    }
  }
}

const ZERO_NODE: Node = { kind: 'num', value: 0 };
const astCache = new Map<string, Node>();

export function isExpr(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

export function evaluateExpr(source: string, scope: Record<string, number>): number {
  let ast = astCache.get(source);
  if (ast === undefined) {
    try {
      ast = parse(source);
    } catch (e) {
      console.warn(`pixi-effects: expression failed: ${source}`, e);
      ast = ZERO_NODE;
    }
    astCache.set(source, ast);
  }
  try {
    return evalNode(ast, scope);
  } catch (e) {
    console.warn(`pixi-effects: expression failed: ${source}`, e);
    return 0;
  }
}
