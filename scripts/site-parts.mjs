// The parts every page shares: the <head> links, the header and the footer. This file is the one place to change the navigation;
// `npm run site:sync` writes the result into the pages between their <!--site:…--> markers (a test fails when a page is stale).
export const REPO = 'https://github.com/yjmtmtk/pixi-effects';
export const NPM = 'https://www.npmjs.com/package/pixi-effects';
/** The author's X account. */
export const AUTHOR_X = 'https://x.com/t_yjm';

/** The entrances, with their address from the site root. */
export const NAV = [
  { id: 'gallery', label: 'Gallery', href: 'gallery/' },
  { id: 'lab', label: 'Lab', href: 'lab/' },
  { id: 'forai', label: 'For AI', href: 'for-ai.html' },
];

export const rootPrefix = (depth) => '../'.repeat(depth);

export function renderHead({ root }) {
  const s = `${root}site/shared/`;
  return [
    `<link rel="stylesheet" href="${s}tokens.css">`,
    `<link rel="stylesheet" href="${s}site.css">`,
    `<script src="${s}live.js" defer></script>`,
  ].join('\n');
}

export function renderHeader({ root, current = '' }) {
  const cur = (id) => (id === current ? ' aria-current="page"' : '');
  const links = NAV.map((n) => `<a href="${root}${n.href}"${cur(n.id)}>${n.label}</a>`).join('\n      ');
  return `<a class="skip" href="#main">Skip to content</a>
<header class="top">
  <div class="wrap">
    <a class="brand" href="${root || './'}"${cur('home')}><span class="dia" aria-hidden="true"></span>pixi-effects</a>
    <nav aria-label="Site">
      ${links}
      <a class="gh" href="${REPO}">GitHub</a>
    </nav>
  </div>
</header>`;
}

export function renderFooter({ root }) {
  const entrances = NAV.map((n) => `<a href="${root}${n.href}">${n.label}</a>`).join('\n      ');
  return `<footer class="site-foot">
  <div class="wrap">
    <p class="links">
      <a href="${REPO}">GitHub</a>
      <a href="${NPM}">npm</a>
      <a href="${REPO}/blob/main/CHANGELOG.md">CHANGELOG</a>
      ${entrances}
      <a href="${AUTHOR_X}" rel="me noopener">Author on X</a>
    </p>
    <p class="end"><span class="dia" aria-hidden="true"></span><span>pixi-effects · MIT · made with PixiJS</span></p>
  </div>
</footer>`;
}
