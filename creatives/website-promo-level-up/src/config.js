/*
 * "Næste level" — all copy and colours live here.
 * Text markup: *word* = highlight colour. Lines are short on purpose: one line holds about 21 characters.
 * Timing is locked to a 144 BPM grid (1 beat = 0.417 s), so keep each text about as long as it is now.
 */
window.CONFIG = {
  brand: {
    name: 'sitecrew',                                  // wordmark on the end card (placeholder brand)
    tagline: ['HJEMMESIDER TIL', 'HÅNDVÆRKERE'],
    cta: '▶ FÅ EN GRATIS DEMO',
  },

  title: ['NÆSTE', 'LEVEL'],
  hook: 'ER DIT FIRMA KLAR?',
  pressStart: '▶ TRYK START',

  hud: { customers: 'KUNDER', level: 'LEVEL' },

  // the ceiling the hero keeps bumping into
  wall: 'INGEN HJEMMESIDE',

  dialog: {
    goal: ['*LEVEL 1*', 'MÅL: FLERE KUNDER'],
    stuck: ['AV! UDEN *HJEMMESIDE*', 'KOMMER DU IKKE', 'VIDERE.'],
    powerup: ['*POWER-UP:*', 'NY HJEMMESIDE!'],
    levelUp: 'LEVEL UP!',
    cleared: ['*NÆSTE LEVEL:*', 'KLARET!'],
  },

  // one per platform on the climb, each with its own icon: bolt, phone, calendar, star
  features: ['LYNHURTIG', 'MOBILVENLIG', 'NEM AT BOOKE', '5 STJERNER'],

  colors: {
    ink: '#14121f',       // outlines
    night: '#0b1030',
    brand: '#ff6a1a',     // hi-vis orange: vest, flag, logo
    gold: '#ffc933',      // hard hat, highlights
    glow: '#5cf2e6',      // power-up
  },
};
