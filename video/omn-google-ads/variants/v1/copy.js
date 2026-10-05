/* Version 1 – tekster på skærmen. Hver cue er [speak-klip, ordnummer, evt. forskydning i sek.]
 * og peger på ordtiderne i cues.js, så teksten følger speaken. size er en skriftstørrelse i px,
 * enten ét tal eller [16:9, 9:16]. Scene 3 forudsætter, at l3 begynder med "Med Google Ads fra
 * O M N", og logoet, at l6 begynder med "O M N". */
window.COPY = {
  h1: { pre: 'Lige nu søger nogen på', ul: 'Google', cues: [['l1', 0], ['l1', 1], ['l1', 2], ['l1', 3], ['l1', 4], ['l1', 5]] },
  query: { text: 'tømrer i nærheden', at: 1.45 },
  ac: [['tømrer ', 'i nærheden'], ['tømrer ', 'pris pr. time'], ['maler ', 'i nærheden'], ['tagdækker ', 'tilbud']],
  s2: {
    a: { text: 'Finder de', cue: ['l2', 0] },
    b: { text: 'DIG?', cue: ['l2', 2] },
    c: { text: '– eller din', cue: ['l2', 3] },
    d: { text: 'KONKURRENT?', cue: ['l2', 5] },
  },
  s3: {
    star: { text: 'står du', cue: ['l3', 7] },
    ov: { text: 'ØVERST', cue: ['l3', 9] },
    cap: { pre: 'Præcis når kunden', hl: 'søger.', post: '', cues: [['l3', 10], ['l3', 11], ['l3', 12], ['l3', 13]], hlCue: ['l3', 13] },
    click: null,
  },
  s6: {
    oname: { text: 'Online Marketing Nu', cues: [['l6', 3], ['l6', 4], ['l6', 5]] },
    tag: { text: 'Google Ads til håndværkere', cue: null },
  },
};
