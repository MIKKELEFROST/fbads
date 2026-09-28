/*
 * "Tvillingerne" — all copy and colours live here.
 * Timing is locked to a 120 BPM grid (1 beat = 0.5 s), so keep the lines about as long as they are now.
 * *word* is set in orange. The headline lines fit about 16 characters at the current size.
 */
window.CONFIG = {
  brand: {
    name: 'sitecrew',                                   // wordmark on the end card (placeholder brand)
    tagline: ['Hjemmesider, der', 'gør forskellen.'],
    cta: 'Få en gratis demo',
  },

  // the headlines, two lines each
  twins: ['To tømrere.', 'Lige dygtige.'],
  same: ['Samme værktøj.', 'Samme pris.'],
  only: ['Men kun den *ene*', 'får opgaverne.'],
  diff: ['Én forskel:', '*hjemmesiden.*'],

  price: ['450 kr.', 'i timen'],                       // the price sticker both twins get
  counter: 'Nye opgaver',                              // the counter above each twin
  // what comes in on the right twin's phone, one card per ring
  jobs: [
    { title: 'Ny opgave', detail: 'Terrasse · 24 m²', icon: 'calendar' },
    { title: 'Ny opgave', detail: 'Carport', icon: 'calendar' },
    { title: 'Tilbud accepteret', detail: 'Nyt køkken', icon: 'check' },
    { title: 'Ny anmeldelse', detail: '★★★★★', icon: 'star' },
  ],
  // the two phones in the reveal
  site: { name: 'Tømrer Hansen', headline: 'Din lokale tømrer', sub: 'Tag · terrasse · køkken', button: 'Book tid' },
  nosite: { title: 'Ingen hjemmeside', sub: 'Kunderne kan ikke finde dig.' },

  colors: {
    ink: '#1d1a2b',      // text
    orange: '#ff6a2b',   // cap, highlights, CTA
    cream: '#fff1dc',    // background
    peach: '#ffd7a0',    // the circle behind each twin
    floor: '#f3c893',
    blue: '#2f6bd8',     // work jacket
    yellow: '#ffd23f',   // stripe, folding rule
    green: '#17a36b',    // ticks
    red: '#e5352b',      // the spot-the-difference circle
  },
};
