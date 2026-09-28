/*
 * "Håndlavet" — all copy and colours live here.
 * The collage headlines are cut out letter by letter; each word is stuck on when the voice says it (the times in
 * `at` are seconds and come from the voice-over, see vo/da/cues.json). Keep lines to about 10 characters.
 */
window.CONFIG = {
  brand: {
    name: 'sitecrew',                                   // wordmark on the end card (placeholder brand)
    tagline: ['Håndlavede hjemmesider', 'til håndværkere.'],
    cta: 'Få en gratis demo',
  },

  // [word, at] per line
  scenes: {
    hands: [[['DU', 0.30], ['ER', 0.42], ['GOD', 0.52]], [['MED', 0.70], ['DINE', 0.82]], [['HÆNDER.', 1.04]]],
    search: [[['MEN', 2.72], ['ONLINE', 2.96]], [['ER', 3.44], ['DU', 3.54], ['SVÆR', 3.69]], [['AT', 3.97], ['FINDE.', 4.11]]],
    build: [[['KLIP.', 5.55]], [['KLISTR.', 6.05]], [['BYG.', 6.65]]],
    ring: [[['RING', 8.99]], [['RING!', 9.28]]],
  },
  search: 'tømrer i nærheden',
  site: { trade: 'Snedker & tømrer', headline: 'Nyt køkken?', button: 'Book tid' },
  notes: ['Ny booking · køkken', 'Nyt tilbud · tag', 'Ny anmeldelse'],

  colors: {
    ink: '#1e1c1a',
    kraft: '#cfae83',
    red: '#e0483a',
    blue: '#26457a',
    yellow: '#f2c13a',
    green: '#3f9b6b',
    cream: '#f7f0e1',
    orange: '#f07a3a',
  },
};
