/*
 * "Vejrudsigten" — all copy and colours live here. The spoken lines are in vo/da/cues.json; the captions below
 * repeat them in short form for viewers watching without sound.
 */
window.CONFIG = {
  brand: {
    name: 'sitecrew',                                   // wordmark on the end card (placeholder brand)
    tagline: ['Hjemmesider, der', 'fylder kalenderen.'],
    cta: 'Få en gratis demo',
  },

  title: { chip: 'VEJRET', rest: 'for din kalender' },
  clock: { day: 'Mandag', time: '07:42' },
  // one caption per spoken line, in the band above the map's south coast ('' = no caption: the header already says
  // it, and the last line is on the end card)
  captions: ['', 'Tørt · ingen opgaver i sigte', 'Fra vest: en ny hjemmeside', 'Skybrud af kunder', ''],
  front: 'NY HJEMMESIDE',                              // the label riding on the weather front
  counts: [6, 12, 5, 8, 21],                           // new jobs per city after the showers (Aalborg, Aarhus, Esbjerg, Odense, København)
  days: ['MAN', 'TIR', 'ONS', 'TOR', 'FRE'],
  full: ['Fuldt', 'booket'],
  outlook: ['Prognose:', 'travlt.'],

  colors: {
    navy: '#0a1f45',     // studio background
    sea: '#12407d',
    dry: '#d9b566',      // parched land
    green: '#62b86a',    // land after the front
    orange: '#ff6a2b',   // the front, highlights, CTA
    sun: '#ffc53d',
    ink: '#0b1a36',
  },
};
