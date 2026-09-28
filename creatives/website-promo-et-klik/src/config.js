/*
 * "Ét klik" — all copy and colours live here.
 * Timing is locked to a 120 BPM grid (1 beat = 0.5 s), so keep the lines about as long as they are now:
 * headlines are set in a monospaced font, about 17 characters fit on a line.
 */
window.CONFIG = {
  brand: {
    name: 'sitecrew',                                   // wordmark on the end card (placeholder brand)
    tagline: ['Hjemmesider, der sætter', 'kunderne i gang.'],
    cta: 'Få en gratis demo',
  },

  hook: ['Ét klik på', 'din hjemmeside …'],
  chain: ['… og det hele', 'går i gang.'],
  // one per domino, ticked off as it falls
  steps: ['Booking', 'Bekræftelse sendt', 'Påmindelse sendt', 'Lagt i kalenderen'],
  notice: { title: 'Ny opgave booket', detail: 'Carport · torsdag kl. 8.00' },
  payoff: ['Du skal bare', 'møde op.'],

  // the example client's website on the phone
  site: { trade: 'Tømrer & snedker', headline: 'Ny carport?', sub: 'Vi bygger den på to dage.', button: 'Book tid', booked: 'Booket' },

  colors: {
    ink: '#1d1a2b',      // text, end card
    orange: '#ff6a2b',   // the button, the ball, the CTA
    green: '#17a36b',    // ticks
    gold: '#f7b52c',     // stars and the bell
    board: '#efe3cf',    // pegboard wall
  },
};
