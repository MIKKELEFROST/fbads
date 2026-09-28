/*
 * "Håndlavet" — all copy and colours live here.
 * The collage headlines are cut out letter by letter; each word is stuck on when the voice says it (the times in
 * `at` are seconds and come from the voice-over, see vo/da/cues.json). Keep lines to about 10 characters.
 */
window.CONFIG = {
  brand: {
    name: 'sitecrew',                                   // wordmark on the end card (placeholder brand)
    tagline: ['Hjemmesider med håndværk,', 'til håndværkere.'],
    cta: 'Få en gratis demo',
  },

  // [word, at] per line
  scenes: {
    hands: [[['DU', 0.30], ['ER', 0.44], ['DYGTIG', 0.56]], [['MED', 0.86], ['DINE', 0.99]], [['HÆNDER.', 1.21]]],
    search: [[['MEN', 2.70], ['ONLINE', 2.90]], [['ER', 3.40], ['DU', 3.50], ['SVÆR', 3.65]], [['AT', 3.87], ['FINDE.', 3.95]]],
    build: [[['KLIP.', 5.26]], [['LIM.', 5.68]], [['BYG.', 6.18]]],
    ring: [[['RING', 8.71]], [['RING!', 8.97]]],
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
