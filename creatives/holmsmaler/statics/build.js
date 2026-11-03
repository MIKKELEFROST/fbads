// Bygger Meta-statics til Holms Maler & Tømrer i 4:5 (feed) og 9:16 (Stories/Reels).
// Kør: node build.js [annonce-id ...]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SRC = path.join(__dirname, 'src');
const OUT = path.join(__dirname, 'out');
const url = (p) => 'file://' + path.join(SRC, p);

const FORMATS = {
  feed: { w: 1080, h: 1350 },
  // Reels dækker ca. 14 % foroven og 35 % forneden med UI: al tekst ligger i panelet fra 250 px,
  // og ansigtet skal ligge over 1250 px.
  story: { w: 1080, h: 1920 },
};
const SCALE = 1080 / 1024; // kildebillederne er 1024x1536

const USPS = ['30+ års erfaring', 'Dansk Håndværk garantiordning', '100 % tilfredshedsgaranti'];

// crop = kildepixel (y), der skal stå øverst i fotofeltet, pr. format.
const ADS = [
  {
    id: 'vinduer-traek',
    img: '5.webp',
    crop: { feed: 240, story: 230 },
    eyebrow: 'Nye vinduer & døre',
    headline: 'Trækker det fra de <em>gamle vinduer?</em>',
    sub: 'Vi skifter dem, før vinteren for alvor sætter ind.',
  },
  {
    id: 'vinduer-vater',
    img: '1.webp',
    crop: { feed: 300, story: 320 },
    eyebrow: 'Nye vinduer & døre',
    headline: 'Sat i vater.<br>Tætnet til.<br><em>Ryddet op.</em>',
    sub: 'Vi skifter dine vinduer og døre – og efterlader ingen byggerod.',
  },
  {
    id: 'indendoers-detaljer',
    img: '3.webp',
    crop: { feed: 230, story: 215 },
    eyebrow: 'Tømrerarbejde',
    headline: 'Målt to gange. <em>Savet én gang.</em>',
    sub: 'Tømrerarbejde, hvor detaljerne sidder – fra gipsvægge til vinduer, døre og tilbygninger.',
  },
  // December 2026
  {
    id: 'dec-vinduer-vinter',
    img: '2.webp',
    crop: { feed: 360, story: 380 },
    eyebrow: 'Nye vinduer & døre',
    headline: 'Kan man skifte vinduer <em>om vinteren?</em>',
    sub: 'Ja. Vi tager ét vindue ad gangen, så huset ikke står åbent og bliver koldt.',
  },
  {
    id: 'dec-planlaeg',
    img: '4.webp',
    crop: { feed: 200, story: 190 },
    eyebrow: 'Tømrerarbejde',
    headline: 'Næste års projekt? <em>Få tilbuddet nu.</em>',
    sub: 'Få et uforpligtende tilbud i december – så er I klar, når I vil i gang i det nye år.',
  },
  {
    id: 'dec-indendoers',
    img: '3.webp',
    crop: { feed: 230, story: 215 },
    eyebrow: 'Indendørs tømrerarbejde',
    headline: 'Koldt udenfor?<br><em>Vi bygger indenfor.</em>',
    sub: 'Gipsvægge, døre og indvendigt tømrerarbejde – vinteren er tiden til indendørs projekter.',
  },
];

const check = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#F9CE11"/><path d="M6.8 12.4l3.4 3.4 7-7.4" fill="none" stroke="#072235" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const arrow = `<svg viewBox="0 0 24 24"><path d="M4 12h15m-6-6 6 6-6 6" fill="none" stroke="#072235" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const usps = (cls) => `<ul class="${cls}">${USPS.map((u) => `<li>${check}${u}</li>`).join('')}</ul>`;
const cta = `<div class="cta-row"><div class="cta">Få et uforpligtende tilbud${arrow}</div><div class="phone"><span>eller ring</span>60 22 13 36</div></div>`;

function html(ad, fmtName) {
  const f = FORMATS[fmtName];
  const story = fmtName === 'story';
  const offset = -Math.round(ad.crop[fmtName] * SCALE);
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><style>
@font-face{font-family:Lato;font-weight:400;src:url(${url('fonts/lato-400.woff2')}) format('woff2')}
@font-face{font-family:Lato;font-weight:700;src:url(${url('fonts/lato-700.woff2')}) format('woff2')}
@font-face{font-family:Lato;font-weight:900;src:url(${url('fonts/lato-900.woff2')}) format('woff2')}
:root{--navy:#072235;--navy-rgb:7,34,53;--yellow:#F9CE11;--pad:68px}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${f.w}px;height:${f.h}px;background:var(--navy)}
.ad{width:${f.w}px;height:${f.h}px;overflow:hidden;font-family:Lato,sans-serif;color:#fff;display:flex;flex-direction:column}
.panel{background:var(--navy);padding:${story ? '250px var(--pad) 56px' : '52px var(--pad) 46px'};border-bottom:8px solid var(--yellow);flex:none}
.top{display:flex;align-items:center;justify-content:space-between;margin-bottom:${story ? 40 : 28}px}
.logo{height:${story ? 56 : 50}px;display:block}
.eyebrow{background:var(--yellow);color:var(--navy);font-weight:900;font-size:${story ? 25 : 23}px;letter-spacing:.12em;
  text-transform:uppercase;padding:9px 16px 8px;border-radius:6px}
h1{font-weight:900;font-size:${story ? 94 : 80}px;line-height:1.02;letter-spacing:-.015em;text-wrap:balance}
h1 em{font-style:normal;color:var(--yellow)}
.sub{margin-top:${story ? 22 : 16}px;font-size:${story ? 36 : 32}px;line-height:1.28;max-width:900px;opacity:.92;text-wrap:pretty}
.photo{position:relative;flex:1;background:url(${url('img/' + ad.img)}) 0 ${offset}px/1080px auto no-repeat}
.shade{position:absolute;left:0;right:0;bottom:0;height:470px;
  background:linear-gradient(0deg,rgba(var(--navy-rgb),.95) 0%,rgba(var(--navy-rgb),.82) 45%,rgba(var(--navy-rgb),0) 100%)}
.foot{position:absolute;left:var(--pad);right:var(--pad);bottom:56px}
.usps{list-style:none;display:flex;flex-direction:column;gap:10px;margin-bottom:30px}
.usps li{display:flex;align-items:center;gap:14px;font-size:29px;font-weight:700}
.usps svg,.usps-inline svg{flex:none;width:34px;height:34px}
.usps-inline{list-style:none;display:flex;flex-wrap:wrap;gap:14px 30px;margin:34px 0 38px}
.usps-inline li{display:flex;align-items:center;gap:12px;font-size:27px;font-weight:700}
.cta-row{display:flex;align-items:center;gap:30px}
.cta{display:inline-flex;align-items:center;gap:16px;background:var(--yellow);color:var(--navy);font-weight:900;font-size:${story ? 38 : 35}px;
  padding:${story ? '28px 40px' : '24px 36px'};border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.28)}
.cta svg{width:34px;height:34px}
.phone{font-size:28px;font-weight:700}
.phone span{display:block;font-weight:400;font-size:23px;opacity:.85}
</style></head><body><div class="ad">
<div class="panel">
  <div class="top"><img class="logo" src="${url('logo-hvid.png')}" alt=""><div class="eyebrow">${ad.eyebrow}</div></div>
  <h1>${ad.headline}</h1>
  <p class="sub">${ad.sub}</p>
  ${story ? usps('usps-inline') + cta : ''}
</div>
<div class="photo">${story ? '' : `<div class="shade"></div><div class="foot">${usps('usps')}${cta}</div>`}</div>
</div></body></html>`;
}

(async () => {
  const only = process.argv.slice(2);
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const ad of ADS.filter((a) => !only.length || only.includes(a.id))) {
    for (const fmtName of Object.keys(FORMATS)) {
      const f = FORMATS[fmtName];
      const page = await browser.newPage({ viewport: { width: f.w, height: f.h }, deviceScaleFactor: 1 });
      const file = path.join(OUT, `${ad.id}-${fmtName}.html`);
      fs.writeFileSync(file, html(ad, fmtName));
      await page.goto('file://' + file);
      await page.evaluate(() => document.fonts.ready);
      const panelBottom = await page.$eval('.panel', (e) => Math.round(e.getBoundingClientRect().bottom));
      await page.screenshot({ path: path.join(OUT, `${ad.id}-${fmtName}.png`) });
      fs.unlinkSync(file);
      await page.close();
      console.log('built', ad.id, fmtName, 'panel ends at', panelBottom);
    }
  }
  await browser.close();
})();
