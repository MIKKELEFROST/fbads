// Maskot-statics pr. ydelse (tag, tilbygning, indendørs, terrasse). 4:5 (1080x1350) og 9:16 (1080x1920).
// Tekster i ADS nedenfor; samme assets som build.js. Kør: node build-ydelser.js [id ...]
// Maskottens "kig frem"-kant ligger ved x=236 i mascot2.png (720x1219).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const A = (p) => 'file://' + path.join(__dirname, 'assets', p);
const OUT = path.join(__dirname, 'out');
const NAVY = '#0C2137', YEL = '#FFC803';

const EDGE = 236, MW = 720, MH = 1219;
// Placér maskotten, så kig-kanten flugter med x=edgeX.
const mascot = (edgeX, top, s, z = 5) =>
  `<img src="${A('mascot2.png')}" style="position:absolute;left:${Math.round(edgeX - EDGE * s)}px;top:${top}px;width:${Math.round(MW * s)}px;z-index:${z}">`;
const img = (f, x, y, w, z = 6, extra = '') => `<img src="${A(f)}" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;z-index:${z};${extra}">`;
const tick = (c = YEL, sw = 6) => `<svg viewBox="0 0 40 40"><path d="M6 21 L16 32 L35 7" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const phoneSvg = (c) => `<svg viewBox="0 0 24 24"><path fill="${c}" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.3 0 .7-.2 1z"/></svg>`;
const dhChip = (x, y, w) => `<div class="chip" style="left:${x}px;top:${y}px;width:${w}px"><img src="${A('danskhaandvaerk.png')}"></div>`;
const tape = (x, y, w, rot, text, z = 8) =>
  `<div class="tape" style="left:${x}px;top:${y}px;width:${w}px;transform:rotate(${rot}deg);z-index:${z}"><span>${(text + '&nbsp;&nbsp;✦&nbsp;&nbsp;').repeat(8)}</span></div>`;

// ---------- Skabelon: tjekliste ----------
function checklist(c, fmt) {
  const st = fmt === 'story';
  const T = st ? 270 : 60;
  const card = st ? { x: 50, y: 520, w: 650, h: 486 } : { x: 50, y: 370, w: 650, h: 560 };
  const waveH = st ? 500 : 330;
  const nameY = card.y + card.h + 24;
  const bandTop = st ? 1140 : 1200;
  return `
  <svg class="wave" viewBox="0 0 1080 ${waveH}" style="height:${waveH}px"><path d="M0 0H1080V${waveH - 80}C 860 ${waveH - 150} 640 ${waveH + 10} 400 ${waveH - 40}C 230 ${waveH - 75} 110 ${waveH - 110} 0 ${waveH - 50}Z" fill="#fff"/></svg>
  <div class="hA" style="top:${T}px">${c.h}</div>
  <div class="hA2" style="top:${T + 128}px"><span>${c.tag}</span></div>
  <div class="card ${st ? 'tight' : ''}" style="left:${card.x}px;top:${card.y}px;width:${card.w}px;height:${card.h}px">
    <div class="clip"></div>
    <div class="cardT">${c.cardTitle}</div>
    ${c.rows.map((r, i) => `<div class="row"><span class="box">${i === 0 ? tick(NAVY, 7) : ''}</span>${r}</div>`).join('')}
    <div class="cardF">${c.footer}</div>
  </div>
  ${mascot(card.x + card.w, card.y - 40, 0.78)}
  ${img('house.png', 60, nameY, 100)}
  ${img('company-name.png', 178, nameY + 10, 380)}
  <div class="band" style="top:${bandTop}px;height:${(st ? 1920 : 1350) - bandTop}px;${st ? 'align-items:flex-start;padding-top:22px' : ''}">
    <div class="call"><span class="pi">${phoneSvg(YEL)}</span><div><b>RING 60 22 13 36</b><small>eller få et uforpligtende tilbud</small></div></div>
  </div>
  ${dhChip(st ? 330 : 720, st ? 1330 : 1225, st ? 420 : 310)}`;
}

// ---------- Skabelon: talebobbel (tema yellow|navy) ----------
function bubble(c, fmt) {
  const st = fmt === 'story';
  const navy = c.theme === 'navy';
  const bT = st ? 270 : 60, bH = 420;
  const pT = st ? 840 : 660;
  const tickCol = navy ? NAVY : YEL;
  return `
  <div class="bubble" style="top:${bT}px;height:${bH}px">
    <div class="bq">${c.q}</div>
    <div class="bb">${c.big}</div>
    <svg class="tail" viewBox="0 0 120 110" style="left:640px;top:${bH - 6}px"><path d="M0 0 H120 L95 110 Z" fill="#fff"/></svg>
  </div>
  ${img('company-name.png', 60, bT + bH + 40, 400, 6)}
  <div class="panel" style="top:${pT}px;height:${(st ? 1920 : 1350) - pT}px;${navy ? `background:${YEL}` : ''}"></div>
  ${mascot(600, pT - 110, 0.84)}
  <ul class="checks" style="left:60px;top:${pT + 110}px;${navy ? `color:${NAVY}` : ''}">
    ${['Over 30 års erfaring', 'Dansk Håndværk garanti', '100 % tilfredshedsgaranti'].map((t) => `<li>${tick(tickCol)}<span>${t}</span></li>`).join('')}
  </ul>
  <div class="pill" style="left:60px;top:${pT + 290}px;${navy ? `background:${NAVY};color:${YEL}` : ''}">FÅ ET TILBUD</div>
  <div class="ph" style="left:60px;top:${pT + 385}px;${navy ? `color:${NAVY}` : ''}"><span class="pi ${navy ? '' : 'y'}" style="${navy ? 'width:62px;height:62px' : ''}">${phoneSvg(navy ? YEL : NAVY)}</span><div><small>RING PÅ</small><b>60 22 13 36</b></div></div>
  ${dhChip(60, pT + (st ? 520 : 500), 330)}
  ${st ? `<div style="position:absolute;left:0;top:1640px;width:1080px;height:280px;background:${navy ? YEL : NAVY};z-index:7"></div>` : ''}`;
}

// ---------- Skabelon: afspærringstape ----------
function tapeAd(c, fmt) {
  const st = fmt === 'story';
  const T = st ? 300 : 150;
  const tiles = { x: 60, y: st ? 680 : 560, w: 560 };
  const ctaY = st ? 1112 : 1000;
  return `
  ${tape(-120, st ? 140 : -10, 1400, -7, c.tapeTop, 3)}
  <div class="hC" style="top:${T}px;font-size:${c.size || 120}px">${c.h1}<br><em>${c.h2}</em></div>
  <div class="sC" style="top:${T + 272}px">${c.sub}</div>
  <div class="tiles" style="left:${tiles.x}px;top:${tiles.y}px;width:${tiles.w}px">
    <div class="tile"><b>30+</b><span>års erfaring med<br>tømrerarbejde</span></div>
    <div class="tile dh"><img src="${A('danskhaandvaerk.png')}"><span>garanti&shy;ordning</span></div>
    <div class="tile"><b>100%</b><span>tilfredsheds&shy;garanti</span></div>
  </div>
  ${mascot(tiles.x + tiles.w, tiles.y - 70, 0.8)}
  <div class="pill" style="left:60px;top:${ctaY}px;z-index:10">FÅ ET UFORPLIGTENDE TILBUD</div>
  ${tape(-80, st ? 1250 : 1150, 1400, 5, 'RING 60 22 13 36', 9)}
  ${img('house.png', 60, st ? 1395 : 1245, st ? 90 : 72, 10)}
  ${img('company-name.png', st ? 170 : 148, st ? 1400 : 1250, st ? 430 : 340, 10)}
  ${st ? tape(-80, 1560, 1400, -4, c.tapeTop, 9) : ''}`;
}

const ADS = {
  'D-tag': { t: tapeAd, bg: NAVY, c: { h1: 'ER TAGET KLAR', h2: 'TIL STORMEN?', size: 98, sub: 'Nyt tag eller renovering – få et tilbud.', tapeTop: 'NYT TAG&nbsp;&nbsp;✦&nbsp;&nbsp;TAGRENOVERING' } },
  'E-tilbygning': { t: bubble, bg: YEL, c: { q: 'Mangler I plads?', big: 'VI BYGGER TIL – SÅ I KAN BLIVE BOENDE!' } },
  'F-indendoers': { t: checklist, bg: NAVY, c: { h: 'BYG INDENFOR', tag: 'MENS DET ER KOLDT', cardTitle: 'Hvad står på listen?', rows: ['Ny skillevæg i gips', 'Nye indvendige døre', 'Små reparationer i huset', 'Større ombygning'], footer: 'Vi klarer dem alle. <u>Ring til os.</u>' } },
  'G-terrasse': { t: bubble, bg: NAVY, c: { theme: 'navy', q: 'Drømmer du om en ny terrasse?', big: 'BYG DEN TIL FORÅRET – FÅ TILBUD NU!' } },
};
const CONCEPTS = Object.fromEntries(Object.entries(ADS).map(([k, v]) => [k, (fmt) => v.t(v.c, fmt)]));
const BG = Object.fromEntries(Object.entries(ADS).map(([k, v]) => [k, v.bg]));

function page(id, fmt) {
  const H = fmt === 'story' ? 1920 : 1350;
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><style>
@font-face{font-family:M;font-weight:100 900;src:url(${A('montserrat-var.woff2')}) format('woff2')}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:${H}px}
.ad{position:relative;width:1080px;height:${H}px;overflow:hidden;background:${BG[id]};font-family:M,sans-serif;color:#fff}
.wave{position:absolute;left:0;top:0;width:1080px;z-index:1}
/* A */
.hA{position:absolute;left:58px;z-index:2;color:${NAVY};font-weight:900;font-size:118px;letter-spacing:-.02em;line-height:1}
.hA2{position:absolute;left:60px;z-index:2;font-weight:900;font-size:66px;color:${NAVY};letter-spacing:.01em}
.hA2 span{background:${YEL};padding:4px 18px 2px;border-radius:6px;box-decoration-break:clone}
.card{position:absolute;z-index:4;background:#fff;border-radius:28px;color:${NAVY};padding:58px 44px 0;box-shadow:0 18px 40px rgba(0,0,0,.35)}
.clip{position:absolute;left:50%;top:-30px;transform:translateX(-50%);width:200px;height:58px;background:${YEL};border-radius:14px;border:6px solid ${NAVY}}
.clip:after{content:"";position:absolute;left:50%;top:10px;transform:translateX(-50%);width:44px;height:14px;border-radius:7px;background:${NAVY}}
.cardT{font-weight:800;font-size:38px;margin-bottom:26px}
.row{display:flex;align-items:center;gap:20px;font-weight:600;font-size:31px;height:84px;border-bottom:2px dashed #c9d2dc}
.box{flex:none;width:48px;height:48px;border:5px solid ${NAVY};border-radius:9px;display:flex;align-items:center;justify-content:center}
.box svg{width:44px;height:44px;margin:-6px -2px 0 0}
.cardF{font-weight:800;font-size:31px;margin-top:26px}
.card.tight{padding-top:50px}.card.tight .cardT{margin-bottom:14px}.card.tight .row{height:76px}.card.tight .cardF{margin-top:20px}
.cardF u{text-decoration:none;background:linear-gradient(transparent 60%,${YEL} 60%)}
.band{position:absolute;left:0;width:1080px;height:150px;background:${YEL};z-index:7;display:flex;align-items:center;padding:0 60px}
.call{display:flex;align-items:center;gap:22px;color:${NAVY}}
.call b{display:block;font-weight:900;font-size:50px;letter-spacing:-.01em;line-height:1}
.call small{display:block;font-weight:600;font-size:26px;margin-top:6px}
.pi{width:78px;height:78px;border-radius:50%;background:${NAVY};display:flex;align-items:center;justify-content:center;flex:none}
.pi svg{width:42px;height:42px}
.pi.y{background:${YEL};width:62px;height:62px}.pi.y svg{width:32px;height:32px}
.chip{position:absolute;z-index:8;background:#fff;border-radius:18px;padding:16px 22px;box-shadow:0 10px 24px rgba(0,0,0,.25)}
.chip img{width:100%;display:block}
/* B */
.bubble{position:absolute;left:50px;width:980px;background:#fff;border-radius:44px;z-index:4;color:${NAVY};padding:58px 56px;box-shadow:0 20px 0 rgba(12,33,55,.18)}
.bq{font-weight:700;font-size:40px}
.bb{font-weight:900;font-size:84px;line-height:1;letter-spacing:-.02em;margin-top:18px}
.tail{position:absolute;width:120px;height:110px}
.panel{position:absolute;left:0;width:600px;background:${NAVY};border-top-right-radius:48px;z-index:3}
.checks{position:absolute;z-index:6;list-style:none;display:flex;flex-direction:column;gap:14px;font-weight:600;font-size:28px}
.checks li{display:flex;align-items:center;gap:14px;white-space:nowrap}
.checks svg{width:36px;height:36px;flex:none}
.pill{position:absolute;z-index:6;background:${YEL};color:${NAVY};font-weight:800;font-size:30px;height:72px;padding:0 46px;border-radius:40px;display:flex;align-items:center;white-space:nowrap;box-shadow:0 8px 0 rgba(0,0,0,.25)}
.ph{position:absolute;z-index:6;display:flex;align-items:center;gap:16px}
.ph small{display:block;font-weight:700;font-size:17px;letter-spacing:.06em}
.ph b{display:block;font-weight:800;font-size:36px;line-height:1.05}
/* C */
.tape{position:absolute;height:86px;background:repeating-linear-gradient(-45deg,${YEL} 0 40px,#111 40px 80px);display:flex;align-items:center;overflow:hidden;box-shadow:0 10px 24px rgba(0,0,0,.4);transform-origin:center}
.tape span{white-space:nowrap;font-weight:900;font-size:34px;color:${NAVY};background:${YEL};padding:6px 0;letter-spacing:.03em;margin-left:-40px}
.hC{position:absolute;left:58px;z-index:4;font-weight:900;font-size:120px;line-height:.98;letter-spacing:-.025em}
.hC em{font-style:normal;color:${YEL}}
.sC{position:absolute;left:60px;z-index:4;font-weight:600;font-size:44px}
.tiles{position:absolute;z-index:4;display:flex;flex-direction:column;gap:18px}
.tile{background:#fff;color:${NAVY};border-radius:22px;height:118px;display:flex;align-items:center;gap:22px;padding:0 28px;box-shadow:0 12px 28px rgba(0,0,0,.35)}
.tile b{font-weight:900;font-size:62px;color:${NAVY};min-width:150px;letter-spacing:-.02em}
.tile span{font-weight:700;font-size:26px;line-height:1.2}
.tile.dh img{width:240px}
.tile.dh span{font-size:24px}
</style></head><body><div class="ad">${CONCEPTS[id](fmt)}</div></body></html>`;
}

(async () => {
  const only = process.argv.slice(2);
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  for (const id of Object.keys(CONCEPTS).filter((i) => !only.length || only.includes(i))) {
    for (const fmt of ['feed', 'story']) {
      const H = fmt === 'story' ? 1920 : 1350;
      const p = await b.newPage({ viewport: { width: 1080, height: H } });
      const f = path.join(OUT, `${id}-${fmt}.html`);
      fs.writeFileSync(f, page(id, fmt));
      await p.goto('file://' + f);
      await p.evaluate(() => document.fonts.ready);
      await p.screenshot({ path: path.join(OUT, `${id}-${fmt}.png`) });
      fs.unlinkSync(f);
      await p.close();
      console.log('built', id, fmt);
    }
  }
  await b.close();
})();
