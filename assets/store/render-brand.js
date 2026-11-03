// Нишонаи «Тезрасон»: ҳарфи «Т» + хатҳои суръат + нуқтаи расонидан. Ҳама аз як SVG.
const { chromium } = require('playwright');
const fs = require('fs');
const GREEN = '#0F9D58', GREEN_D = '#0B7A44', GOLD = '#F2B705', WHITE = '#FFFFFF';

// Нишона дар координатаҳои 0..100; scale/offset барои минтақаи бехатари adaptive icon
const mark = (fill, dot) => `
  <g transform="translate(-1 -7.5)">
    <rect x="16" y="29" width="15" height="5" rx="2.5" fill="${fill}" opacity=".9"/>
    <rect x="21" y="38" width="10" height="5" rx="2.5" fill="${fill}" opacity=".75"/>
    <rect x="25" y="47" width="6" height="5" rx="2.5" fill="${fill}" opacity=".6"/>
    <rect x="36" y="27" width="50" height="15" rx="7.5" fill="${fill}"/>
    <rect x="53.5" y="27" width="15" height="47" rx="7.5" fill="${fill}"/>
    ${dot ? `<circle cx="61" cy="83" r="5.5" fill="${dot}"/>` : ''}
  </g>`;
const svg = (size, body, bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  ${bg ?? ''}${body}</svg>`;
const grad = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${GREEN}"/><stop offset="1" stop-color="${GREEN_D}"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/>`;
// Минтақаи бехатари Android adaptive icon: 66 % марказ → нишонаро 0.62 хурд мекунем
const safe = (inner) => `<g transform="translate(19 19) scale(0.62)">${inner}</g>`;

const files = {
  'icon.png': [1024, svg(1024, mark(WHITE, GOLD), grad)],
  'android-icon-foreground.png': [1024, svg(1024, safe(mark(WHITE, GOLD)))],
  'android-icon-background.png': [1024, svg(1024, '', grad)],
  'android-icon-monochrome.png': [1024, svg(1024, safe(mark(WHITE, WHITE)))],
  'splash-icon.png': [1024, svg(1024, mark(GREEN, GOLD))],
  'favicon.png': [48, svg(48, mark(WHITE, GOLD), `<rect width="100" height="100" rx="22" fill="${GREEN}"/>`)],
};

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ deviceScaleFactor: 1 });
  fs.mkdirSync('out', { recursive: true });
  for (const [name, [size, s]] of Object.entries(files)) {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0;background:transparent">${s}</body></html>`);
    await p.locator('svg').screenshot({ path: `out/${name}`, omitBackground: true });
  }
  // Пешнамоиш: icon дар шаклҳои гуногуни Android + splash + feature graphic
  const prev = `<html><body style="margin:0;font-family:system-ui;background:#eef0f3;padding:24px;display:flex;gap:28px;align-items:center;flex-wrap:wrap">
    ${['22%', '50%', '8%'].map((r) => `<div style="text-align:center"><div style="width:160px;height:160px;border-radius:${r};overflow:hidden;box-shadow:0 2px 8px #0002">${svg(160, mark(WHITE, GOLD), grad)}</div><div style="margin-top:8px;font-size:15px">Тезрасон</div></div>`).join('')}
    <div style="width:180px;height:360px;background:#fff;border-radius:22px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px #0002">${svg(110, mark(GREEN, GOLD))}</div>
  </body></html>`;
  await p.setViewportSize({ width: 900, height: 420 });
  await p.setContent(prev);
  await p.screenshot({ path: 'preview.png' });
  // Google Play feature graphic 1024×500
  await p.setViewportSize({ width: 1024, height: 500 });
  await p.setContent(`<html><body style="margin:0"><div style="width:1024px;height:500px;background:linear-gradient(135deg,${GREEN},${GREEN_D});display:flex;align-items:center;gap:40px;padding:0 90px;box-sizing:border-box;font-family:system-ui,sans-serif;color:#fff">
    <div style="width:220px;height:220px;flex:none">${svg(220, mark(WHITE, GOLD))}</div>
    <div><div style="font-size:92px;font-weight:800;letter-spacing:-1px">Тезрасон</div>
    <div style="font-size:30px;opacity:.92;margin-top:8px">Хӯрок ва маҳсулот — зуд ба хонаи шумо</div>
    <div style="font-size:26px;opacity:.75;margin-top:14px">Душанбе</div></div></div></body></html>`);
  await p.screenshot({ path: 'out/feature-graphic.png' });
  await b.close();
})();
