/*
 * Dansk version (standard). Alt, du vil ændre for et nyt brand eller sprog, ligger her.
 * Engelsk version: config.en.js (åbn/render med ?lang=en / --lang=en).
 *
 * Tekstmarkering:  *ord*  = accentfarve,  \n = linjeskift,  |  = linjeskift kun i 9:16 (mellemrum i 16:9).
 * Timingen ligger fast på et 128 BPM-grid (1 slag = 0,469 s), så hold linjerne omtrent så korte som her.
 */
window.CONFIG = {
  lang: 'da',

  brand: {
    name: 'sitecrew',                       // ordmærket på slutbilledet (pladsholder-brand)
    tagline: 'Hjemmesider, der skaffer|*flere opgaver.*',
    cta: 'Få en gratis demo',
    url: '',                                // valgfri linje under CTA, fx 'sitecrew.dk'
  },

  colors: {
    ink: '#101114',
    paper: '#F3EEE4',
    orange: '#FF5A1F',                      // brandfarve
    yellow: '#FFC53D',                      // stjerner + afspærringstape
  },

  // Scene 1 — målgruppen kaldes op, ét fag pr. slag
  trades: [
    { word: 'VVS’ere.', icon: 'wrench' },
    { word: 'Elektrikere.', icon: 'zap' },
    { word: 'Malere.', icon: 'paint-roller' },
    { word: 'Tømrere.', icon: 'hammer' },
  ],
  kicker: 'Hjemmesider til',

  // Scene 2 — problemet
  fiveStar: 'Dit arbejde får\n*5 stjerner.*',
  website: 'Din hjemmeside?',
  notSoMuch: '*Knap så mange.*',

  // Overgangstape
  tape: 'Ombygning i gang',

  // Scene 3 — vi bygger
  build: 'Vi bygger *en ny.*',
  chips: [
    { text: 'Klar til Google', icon: 'search', target: 'url' },
    { text: 'Lynhurtig', icon: 'zap', target: 'h1' },
    { text: 'Online booking', icon: 'calendar-check', target: 'book' },
    { text: 'Mobilvenlig', icon: 'smartphone', target: 'device' },
  ],

  // Scene 4 — gevinsten
  calls: 'Du får\n*opkaldene.*',
  caller: { name: 'Ny kunde', note: 'Indgående opkald …' },
  now: 'nu',
  notifications: [
    { icon: 'calendar-check', color: '#2563EB', title: 'Ny booking', body: 'Utæt rør · tirsdag kl. 9.00' },
    { icon: 'message-square-text', color: '#16A34A', title: 'Tilbudsforespørgsel', body: '»Kan I skifte vores gasfyr?«' },
    { icon: 'star', color: '#F5A300', title: 'Ny 5-stjernet anmeldelse', body: '»Hurtig og professionel hjælp!«' },
    { icon: 'calendar-check', color: '#2563EB', title: 'Ny booking', body: 'Stoppet afløb · torsdag kl. 14.30' },
  ],

  // Rullende fag-bånd på slutbilledet
  marquee: ['VVS’ere', 'Elektrikere', 'Malere', 'Tømrere', 'Murere', 'Tagdækkere', 'Anlægsgartnere', 'Låsesmede', 'Rengøring'],

  // Eksempel-kundens hjemmeside, der bygges på skærmen (fiktiv)
  demo: {
    name: 'Nordflow',
    trade: 'VVS',
    domain: 'nordflow-vvs.dk',
    nav: ['Ydelser', 'Priser', 'Anmeldelser', 'Område'],
    hotline: 'Døgnvagt',
    navCta: 'Book tid',
    eyebrow: 'Ledig i dag · Hjælp samme dag',
    eyebrowShort: 'Ledig i dag',
    h1: 'VVS-problemer?\n*Løst i dag.*',
    lead: 'Utætte rør, fyr og stoppede afløb — klaret af lokale, autoriserede VVS’ere.',
    book: 'Book tid',
    call: 'Ring nu',
    callShort: 'Ring',
    rating: '4,9',
    ratingChip: '4,9 på Google',
    reviews: 'fra 300+ anmeldelser',
    insured: 'Autoriseret & forsikret',
    badge: 'Hjælp samme dag',
    servicesTitle: 'Vores ydelser',
    servicesAll: 'Se alle ydelser',
    services: [
      { icon: 'droplets', title: 'Utætte rør', text: 'Fundet og lukket hurtigt.', tint: '#E0F2FE', ink: '#0369A1' },
      { icon: 'flame', title: 'Fyrservice', text: 'Sikkert, godkendt og varmt.', tint: '#FFEDD5', ink: '#C2410C' },
      { icon: 'wrench', title: 'Stoppede afløb', text: 'Renset uden rod.', tint: '#DCFCE7', ink: '#15803D' },
    ],
    // etiketter på wireframe-boksene
    wires: { nav: 'NAVIGATION', h1: 'OVERSKRIFT', img: 'BILLEDE', cta: 'KNAPPER', trust: 'ANMELDELSER', card: 'YDELSE' },
  },
};
