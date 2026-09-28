/*
 * "Tvillingerne · tegneserie" — all copy and colours live here. Same story as creatives/website-promo-tvillingerne,
 * told as a comic page. Timing is locked to a 120 BPM grid (1 beat = 0.5 s), so keep the lines about as long as
 * they are now: a caption box fits about 16 characters, a sound effect about 8.
 */
window.CONFIG = {
  brand: {
    name: 'sitecrew',                                   // the masthead on the cover (placeholder brand)
    tagline: ['Hjemmesider, der', 'gør forskellen.'],
    cta: 'Få en gratis demo',
    issue: 'NR. 1',                                     // the issue box in the cover's corner
  },

  // caption boxes, two per beat of the story
  captions: {
    twins: ['To tømrere.', 'Lige dygtige.'],
    same: ['Samme værktøj.', 'Samme pris.'],
    only: ['Men kun den ene …', '… får opgaverne.'],
    diff: ['Én forskel:', 'Hjemmesiden.'],             // the second one is lettered big, as the punchline
  },
  // sound effects, lettered on the page
  sfx: { split: 'RRRIP!', toss: 'SVUP!', catch: 'KLAP!', sticker: 'KA-CHING!', ring: 'RIIING!', ping: 'PLING!', crickets: 'KRIK … KRIK …', push: 'BAM!' },

  price: ['450 kr.', 'i timen'],                       // the price sticker both twins get
  // what pops out of the right twin's phone, one balloon per ring
  jobs: [
    { title: 'Ny opgave!', detail: 'Terrasse · 24 m²' },
    { title: 'Ny opgave!', detail: 'Carport' },
    { title: 'Tilbud OK!', detail: 'Nyt køkken' },
    { title: '★★★★★', detail: 'Ny anmeldelse' },
  ],
  // the two phones in the close-up
  site: { name: 'Tømrer Hansen', headline: 'Din lokale tømrer', sub: 'Tag · terrasse · køkken', button: 'Book tid' },
  nosite: { title: 'Ingen hjemmeside', sub: 'Kunderne kan ikke finde dig.' },

  colors: {
    ink: '#141013',      // outlines and lettering
    paper: '#fbf3e1',    // newsprint
    yellow: '#ffd83a',   // caption boxes, sound effects
    red: '#e8342a',      // flannel, the marker circle
    orange: '#ff6a2b',   // the brand, the CTA
    cyan: '#3fb6e8',     // Ben-Day dots, the jeans' highlight
    blue: '#2a5bd7',
    green: '#1faa5c',
  },
};
