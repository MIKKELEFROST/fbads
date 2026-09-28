/*
 * "Døgnet rundt" — all copy and colours live here.
 * The night's bookings are an electrician's; {n} in the morning line becomes the number of bookings.
 * Timing is locked to a 96 BPM grid (1 beat = 0.625 s), so keep the lines about as long as they are now.
 */
window.CONFIG = {
  brand: {
    name: 'sitecrew',                                   // wordmark on the end card (placeholder brand)
    tagline: ['Hjemmesider, der arbejder', 'døgnet rundt.'],
    cta: 'Få en gratis demo',
  },

  off: 'Du har fri.',
  asleep: 'Du sover.',
  site: 'Din hjemmeside gør ikke.',
  morning: ['Godmorgen.', '{n} nye opgaver.'],

  // [time, text] — each arrives during the night; the clock jumps to its time
  bookings: [
    ['00.12', 'Ny booking · Elbil-lader'],
    ['02.14', 'Tilbud · Ny el-tavle'],
    ['04.05', 'Ny booking · Lamper i stuen'],
    ['05.38', 'Ny booking · Stikkontakter'],
  ],

  colors: {
    ink: '#141a33',     // text on the end card
    warm: '#fff6e8',    // text at night
    gold: '#ffd166',    // times, the van's stripe, the CTA
    green: '#5ee6a8',   // morning ticks
  },
};
