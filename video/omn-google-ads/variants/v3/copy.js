/* Version 3 – maler i fokus ("Er du maler?"). Se variants/v1/copy.js for formatet.
 * Felter, der ikke findes i v1/v2 (s1.mq, serp, s4, s5, hud), erstatter standardteksterne i
 * index.html, så hele filmen handler om ét fag. */
window.COPY = {
  // roligere udgave: ingen rystelser og bas-slag, blød musik uden stortromme (se timeline.js og mix_audio.py)
  mood: 'soft',
  h1: { pre: 'Er du', ul: 'maler?', cues: [['l1', 0], ['l1', 1], ['l1', 2]], size: [140, 116] },
  query: { text: 'maler i nærheden', at: 1.45 },
  ac: [['maler ', 'i nærheden'], ['maler ', 'pris pr. m2'], ['malerfirma ', 'tilbud'], ['male ', 'hus udvendigt']],
  s1: {
    mq: [
      'maler i nærheden · facademaling · male lejlighed · maler i nærheden · facademaling ·',
      'malerfirma tilbud · male hus udvendigt · maler pris · malerfirma tilbud · male hus udvendigt ·',
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
      { nm: 'Konkurrent ApS', url: 'konkurrent.dk', ttl: 'Maler i nærheden – ring i dag' },
      { nm: 'Konkurrent Maler', url: 'konkurrentmaler.dk', ttl: 'Malerarbejde til fast pris' },
      { nm: 'Konkurrent & Søn', url: 'konkurrentogsoen.dk', ttl: 'Erfaren maler i dit område' },
    ],
    you2: 'Din malerforretning',
    you3: 'Maler i nærheden – fast pris',
  },
  s3: {
    star: { text: 'kommer du', cue: ['l3', 7] },
    ov: { text: 'ØVERST', cue: ['l3', 9] },
    cap: { pre: 'Og det er', hl: 'dig,', post: 'de ringer til.', cues: [['l3', 10], ['l3', 11], ['l3', 12], ['l3', 13], ['l3', 14], ['l3', 15], ['l3', 16]], hlCue: ['l3', 13] },
    click: ['l3', 15],
  },
  // fire paneler, ét pr. speak-klip t1–t4; icon er et navn fra ICONS i timeline.js
  s4: {
    label: '04 / OPGAVERNE',
    panels: [
      { word: 'Vægge', icon: 'roller', q: 'male vægge i stuen' },
      { word: 'Lofter', icon: 'ladder', q: 'male loft pris' },
      { word: 'Vinduer', icon: 'window', q: 'male vinduer udvendigt' },
      { word: 'Facader', icon: 'house', q: 'facademaling tilbud' },
    ],
  },
  s5: {
    n2: 'Tilbud på facademaling',
    tickerTag: 'ALLE MALEROPGAVER',
    ticker: ['INDVENDIG MALING', 'FACADEMALING', 'TAPETSERING', 'SPARTLING', 'VINDUER OG DØRE', 'LOFTER', 'TRÆVÆRK', 'GULVBEHANDLING', 'LEJLIGHEDER', 'HUSE', 'ERHVERV', 'NYBYG'],
  },
  s6: {
    oname: { text: 'Google Ads til malere', cues: [['l6', 3], ['l6', 4], ['l6', 5], ['l6', 6]], size: [84, 72] },
    tag: { text: 'Online Marketing Nu', cue: null },
  },
  hud: 'Google Ads · Malere',
};
