/* Version 2 – spørgsmåls-hook ("Bliver du fundet …?"). Se variants/v1/copy.js for formatet. */
window.COPY = {
  h1: { pre: 'Bliver du', ul: 'fundet?', cues: [['l1', 0], ['l1', 1], ['l1', 2]], size: [124, 106] },
  query: { text: 'lokal tømrer', at: 1.73 },
  ac: [['lokal ', 'tømrer'], ['tømrer ', 'i nærheden'], ['lokal ', 'maler'], ['tømrer ', 'pris pr. time']],
  s2: {
    a: { text: 'Lige nu går', cue: ['l2', 0] },
    b: { text: 'OPGAVEN', cue: ['l2', 3], size: 170 },
    c: { text: 'til din', cue: ['l2', 4] },
    d: { text: 'KONKURRENT.', cue: ['l2', 6] },
  },
  s3: {
    star: { text: 'kommer du', cue: ['l3', 7] },
    ov: { text: 'ØVERST', cue: ['l3', 9] },
    cap: { pre: 'Og det er', hl: 'dig,', post: 'de ringer til.', cues: [['l3', 10], ['l3', 11], ['l3', 12], ['l3', 13], ['l3', 14], ['l3', 15], ['l3', 16]], hlCue: ['l3', 13] },
    click: ['l3', 15],
  },
  s6: {
    oname: { text: 'Google Ads til håndværkere', cues: [['l6', 3], ['l6', 4], ['l6', 5], ['l6', 6]], size: [74, 66] },
    tag: { text: 'Online Marketing Nu', cue: null },
  },
};
