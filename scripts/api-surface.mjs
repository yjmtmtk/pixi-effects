// The public surface of the library as plain text: every export of every entry (pixi-effects, /controller, /present, /three), the public members of
// classes, the properties of interfaces, and the signatures of functions. It is read from the TypeScript sources, so it cannot drift from the code.
//
//   node scripts/api-surface.mjs            print it
//   node scripts/api-surface.mjs --write    write docs/api-surface.txt (the committed copy)
//   node scripts/api-surface.mjs --check    exit 1 when the committed copy is out of date (tests/docs/ApiSurface.test.ts does this)
//
// A change to the public surface shows up as a diff of docs/api-surface.txt: a rename or a removal is then a decision somebody made, not an accident.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'docs/api-surface.txt');
const ENTRIES = [
  ['pixi-effects', 'src/index.ts'],
  ['pixi-effects/controller', 'src/Controller.ts'],
  ['pixi-effects/present', 'src/present/index.ts'],
  ['pixi-effects/three', 'src/three/index.ts'],
];

/** What the DSL accepts, from the runtime tables (src/core/layerKeys.ts, src/filters/named.ts): the keys of each kind of layer, the animatable names, the text style keys, the filter types. */
async function dslSection() {
  const out = ['== DSL (the runtime tables) =='];
  const load = async (file) => {
    const js = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
  };
  const keys = await load('src/core/layerKeys.ts');
  const kinds = [['null'], ['camera'], ['light'], ['text'], ['image'], ['video'], ['audio'], ['composition'], ['shader'], ...['rect', 'circle', 'ellipse', 'arc', 'line', 'polygon', 'path'].map(sh => ['shape', sh])];
  const table = kinds.map(([type, shape]) => [shape ? `${shape} shape` : `${type} layer`, new Set(keys.layerKeys({ type, shape }))]);
  const common = [...table[0][1]].filter(k => table.every(([, set]) => set.has(k)));
  out.push(`every layer: ${common.join(' ')}`);
  for (const [label, set] of table) out.push(`${label}: ${[...set].filter(k => !common.includes(k)).join(' ')}`);
  out.push(`animatable (initial / keyframes): ${[...keys.PROP_KEYS].join(' ')}`);
  out.push(`text style: ${keys.STYLE_KEYS.join(' ')}`);
  const named = fs.readFileSync(path.join(root, 'src/filters/named.ts'), 'utf8');
  const core = [...(named.match(/const CORE: Record<string, string> = \{([^}]*)\}/)?.[1] ?? '').matchAll(/(\w+):/g)].map(m => m[1]);
  const core2 = [...(named.match(/const CORE_TYPES = \[\.\.\.Object\.keys\(CORE\), ([^\]]*)\]/)?.[1] ?? '').matchAll(/'(\w+)'/g)].map(m => m[1]);
  const lib = [...(named.match(/const LIBRARY_TYPES = \[([^\]]*)\]/)?.[1] ?? '').matchAll(/'(\w+)'/g)].map(m => m[1]);
  out.push(`filter types: chromaKey custom ${[...core, ...core2, ...lib].join(' ')}`);
  out.push('');
  return out.join('\n');
}

export async function surface() {
  const cfgPath = path.join(root, 'tsconfig.json');
  const cfg = ts.readConfigFile(cfgPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, root);
  const program = ts.createProgram(ENTRIES.map(([, f]) => path.join(root, f)), { ...parsed.options, noEmit: true });
  const checker = program.getTypeChecker();
  const out = [];
  const short = (s, n = 110) => { s = s.replace(/\s+/g, ' '); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const typeOf = (sym, decl) => short(checker.typeToString(checker.getTypeOfSymbolAtLocation(sym, decl), undefined, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope));
  const isHidden = (decl) => (ts.getCombinedModifierFlags(decl) & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) !== 0;
  const optional = (sym) => ((sym.flags & ts.SymbolFlags.Optional) !== 0 ? '?' : '');
  const callSig = (sym, decl) => {
    const t = checker.getTypeOfSymbolAtLocation(sym, decl);
    const sigs = t.getCallSignatures();
    return sigs.map(s => short(checker.signatureToString(s, undefined, ts.TypeFormatFlags.NoTruncation), 160));
  };

  /** The properties of a type (for an interface: only its own, the inherited ones belong to the interfaces it extends). */
  const members = (type, indent = '  ', ownOf = null) => {
    const lines = [];
    for (const m of checker.getPropertiesOfType(type).sort((a, b) => a.name.localeCompare(b.name))) {
      const decl = m.valueDeclaration ?? m.declarations?.[0];
      if (!decl || isHidden(decl) || m.name.startsWith('_') || m.name.startsWith('#')) continue;
      if (ownOf && !(m.declarations ?? []).some(d => d.parent === ownOf)) continue;
      const sigs = callSig(m, decl);
      if (sigs.length && (ts.isMethodDeclaration(decl) || ts.isMethodSignature(decl))) sigs.forEach(sg => lines.push(`${indent}${m.name}${optional(m)}${sg}`));
      else lines.push(`${indent}${m.name}${optional(m)}: ${typeOf(m, decl).replace(/ \| undefined$/, '').replace(/ \| undefined \|/g, ' |')}`);
    }
    return lines;
  };

  for (const [name, file] of ENTRIES) {
    const sf = program.getSourceFile(path.join(root, file));
    const modSym = checker.getSymbolAtLocation(sf);
    out.push(`== ${name} ==`);
    const exports = checker.getExportsOfModule(modSym).sort((a, b) => a.name.localeCompare(b.name));
    const exportedNames = new Set(exports.map(e => e.name));
    const internalBases = new Map();
    for (let sym of exports) {
      const isType = !(sym.flags & ts.SymbolFlags.Value) || (sym.flags & ts.SymbolFlags.Alias && false);
      const target = sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
      const decl = target.valueDeclaration ?? target.declarations?.[0];
      if (!decl) { out.push(`? ${sym.name}`); continue; }
      const f = target.flags;
      if (f & ts.SymbolFlags.Class) {
        out.push(`class ${sym.name}`);
        const inst = checker.getDeclaredTypeOfSymbol(target);
        out.push(...members(inst));
        const ctor = checker.getTypeOfSymbolAtLocation(target, decl).getConstructSignatures();
        ctor.forEach(s => out.push(`  constructor${short(checker.signatureToString(s, undefined, ts.TypeFormatFlags.NoTruncation).replace(/: \w+$/, ''), 160)}`));
      } else if (f & ts.SymbolFlags.Function) {
        const sigs = checker.getTypeOfSymbolAtLocation(target, decl).getCallSignatures();
        sigs.forEach(s => out.push(`function ${sym.name}${short(checker.signatureToString(s, undefined, ts.TypeFormatFlags.NoTruncation), 170)}`));
      } else if (f & ts.SymbolFlags.Interface) {
        const bases = (decl.heritageClauses ?? []).flatMap(h => h.types.map(t => t.expression.getText()));
        for (const h of decl.heritageClauses ?? []) for (const t of h.types) { const b = checker.getSymbolAtLocation(t.expression); const bt = b && (b.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(b) : b); if (bt && !exportedNames.has(bt.name) && (bt.flags & ts.SymbolFlags.Interface)) internalBases.set(bt.name, bt); }
        out.push(`interface ${sym.name}${bases.length ? ' extends ' + bases.join(', ') : ''}`);
        out.push(...members(checker.getDeclaredTypeOfSymbol(target), '  ', decl));
      } else if (f & ts.SymbolFlags.TypeAlias) {
        out.push(`type ${sym.name} = ${short(decl.type ? decl.type.getText() : checker.typeToString(checker.getDeclaredTypeOfSymbol(target)), 170)}`);
      } else if (f & ts.SymbolFlags.Variable) {
        out.push(`const ${sym.name}: ${typeOf(target, decl)}`);
      } else out.push(`? ${sym.name} (${ts.SymbolFlags[f] ?? f})`);
      void isType;
    }
    for (const [bname, bsym] of [...internalBases].sort((a, b) => a[0].localeCompare(b[0]))) {
      const bdecl = bsym.valueDeclaration ?? bsym.declarations?.[0];
      out.push(`interface ${bname} (not exported; the keys of the types above)`);
      out.push(...members(checker.getDeclaredTypeOfSymbol(bsym), '  ', bdecl));
    }
    out.push('');
  }
  return out.join('\n') + '\n' + await dslSection();
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const text = await surface();
  if (process.argv.includes('--write')) { fs.writeFileSync(OUT, text); console.log(`${path.relative(root, OUT)}: ${text.split('\n').length} lines`); }
  else if (process.argv.includes('--check')) {
    const have = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (have !== text) { console.error('docs/api-surface.txt is out of date: run `node scripts/api-surface.mjs --write` and look at the diff'); process.exit(1); }
  } else process.stdout.write(text);
}
