/* Version 4 – tømrer i fokus ("Er du tømrer?"). Samme opbygning som v3 (maler), så de to kan
 * testes direkte mod hinanden. Se variants/v1/copy.js for formatet og v3 for de ekstra felter. */
window.COPY = {
  h1: { pre: 'Er du', ul: 'tømrer?', cues: [['l1', 0], ['l1', 1], ['l1', 2]], size: [140, 116] },
  query: { text: 'tømrer i nærheden', at: 1.45 },
  ac: [['tømrer ', 'i nærheden'], ['tømrer ', 'pris pr. time'], ['tømrerfirma ', 'tilbud'], ['nyt tag ', 'pris']],
  s1: {
    mq: [
      'tømrer i nærheden · nyt tag pris · bygge terrasse · tømrer i nærheden · nyt tag pris ·',
      'tømrerfirma tilbud · skifte vinduer · nyt trægulv · tømrerfirma tilbud · skifte vinduer ·',
    ],
  },
  s2: {
    a: { text: 'Men lige nu går', cue: ['l2', 0] },
    b: { text: 'OPGAVEN', cue: ['l2', 4], size: 170 },
    c: { text: 'til din', cue: ['l2', 5] },
    d: { text: 'KONKURRENT.', cue: ['l2', 7] },
  },
  serp: {
    k: [
      { nm: 'Konkurrent ApS', url: 'konkurrent.dk', ttl: 'Tømrer i nærheden – ring i dag' },
      { nm: 'Konkurrent Byg', url: 'konkurrentbyg.dk', ttl: 'Tømrerarbejde til fast pris' },
      { nm: 'Konkurrent & Søn', url: 'konkurrentogsoen.dk', ttl: 'Erfaren tømrer i dit område' },
    ],
    you2: 'Din tømrerforretning',
    you3: 'Tømrer i nærheden – fast pris',
  },
  s3: {
    star: { text: 'kommer du', cue: ['l3', 7] },
    ov: { text: 'ØVERST', cue: ['l3', 9] },
    cap: { pre: 'Og det er', hl: 'dig,', post: 'de ringer til.', cues: [['l3', 10], ['l3', 11], ['l3', 12], ['l3', 13], ['l3', 14], ['l3', 15], ['l3', 16]], hlCue: ['l3', 13] },
    click: ['l3', 15],
  },
  s4: {
    label: '04 / OPGAVERNE',
    size: [290, 180],   // "TERRASSE" skal kunne være i 9:16
    panels: [
      { word: 'Tag', icon: 'roof', q: 'nyt tag pris' },
      { word: 'Gulve', icon: 'floor', q: 'lægge nyt trægulv' },
      { word: 'Vinduer', icon: 'window', q: 'skifte vinduer tilbud' },
      { word: 'Terrasse', icon: 'deck', q: 'bygge terrasse' },
    ],
  },
  s5: {
    n2: 'Tilbud på ny terrasse',
    tickerTag: 'ALLE TØMREROPGAVER',
    ticker: ['NYT TAG', 'TERRASSER', 'VINDUER OG DØRE', 'GULVE', 'KØKKENER', 'TILBYGNINGER', 'CARPORTE', 'HEGN', 'LOFTER', 'TRAPPER', 'UDESTUER', 'RENOVERING'],
  },
  s6: {
    oname: { text: 'Google Ads til tømrere', cues: [['l6', 3], ['l6', 4], ['l6', 5], ['l6', 6]], size: [84, 72] },
    tag: { text: 'Online Marketing Nu', cue: null },
  },
  hud: 'Google Ads · Tømrere',
};
