/*
 * English version — open or render with ?lang=en / --lang=en (Danish, config.js, is the default).
 * Text markup:  *word*  = accent colour,  \n = line break,  |  = line break in portrait only (a space in landscape).
 * Timing is locked to a 128 BPM grid (1 beat = 0.46875 s), so keep lines about as short as these.
 */
window.CONFIG = {
  lang: 'en',

  brand: {
    name: 'sitecrew',                       // wordmark on the end card (placeholder brand)
    tagline: 'Websites that|*win you jobs.*',
    cta: 'Get your free demo',
    url: '',                                // optional line under the CTA, e.g. 'sitecrew.com'
  },

  colors: {
    ink: '#101114',
    paper: '#F3EEE4',
    orange: '#FF5A1F',                      // brand colour
    yellow: '#FFC53D',                      // stars + hazard tape
  },

  // Scene 1 — audience call-out, one trade per beat
  trades: [
    { word: 'Plumbers.', icon: 'wrench' },
    { word: 'Electricians.', icon: 'zap' },
    { word: 'Painters.', icon: 'paint-roller' },
    { word: 'Cleaners.', icon: 'sparkles' },
  ],
  kicker: 'Websites for',

  // Scene 2 — the problem
  fiveStar: 'You do|*5-star* work.',
  website: 'Your website?',
  notSoMuch: '*Not so much.*',

  // Transition tape
  tape: 'Upgrade in progress',

  // Scene 3 — the build
  build: 'We build *it.*',
  chips: [
    { text: 'Google-ready', icon: 'search', target: 'url' },
    { text: 'Lightning fast', icon: 'zap', target: 'h1' },
    { text: 'Online booking', icon: 'calendar-check', target: 'book' },
    { text: 'Mobile-first', icon: 'smartphone', target: 'device' },
  ],

  // Scene 4 — the payoff
  calls: 'You get\nthe *calls.*',
  caller: { name: 'New customer', note: 'Incoming call…' },
  now: 'now',
  notifications: [
    { icon: 'calendar-check', color: '#2563EB', title: 'New booking', body: 'Leak repair · Tue 9:00 AM' },
    { icon: 'message-square-text', color: '#16A34A', title: 'Quote request', body: '“Can you fit a new boiler?”' },
    { icon: 'star', color: '#F5A300', title: 'New 5-star review', body: '“Fast, friendly and fair!”' },
    { icon: 'calendar-check', color: '#2563EB', title: 'New booking', body: 'Blocked drain · Thu 2:30 PM' },
  ],

  // End card ticker
  marquee: ['Plumbers', 'Electricians', 'Painters', 'Cleaners', 'Roofers', 'Landscapers', 'Carpenters', 'Locksmiths', 'HVAC'],

  // The example client website that gets built on screen (fictional)
  demo: {
    name: 'FlowRight',
    trade: 'Plumbing',
    domain: 'flowrightplumbing.com',
    nav: ['Services', 'Pricing', 'Reviews', 'Areas'],
    hotline: '24/7 hotline',
    navCta: 'Book now',
    eyebrow: 'Available today · Same-day service',
    eyebrowShort: 'Available today',
    h1: 'Plumbing problems?\n*Fixed fast.*',
    lead: 'Leaks, boilers and blocked drains — sorted by local, certified plumbers.',
    book: 'Book online',
    call: 'Call now',
    callShort: 'Call',
    rating: '4.9',
    ratingChip: '4.9 on Google',
    reviews: 'from 300+ reviews',
    insured: 'Licensed & insured',
    badge: 'Same-day service',
    servicesTitle: 'Our services',
    servicesAll: 'See all services',
    services: [
      { icon: 'droplets', title: 'Leak repair', text: 'Found and fixed, fast.', tint: '#E0F2FE', ink: '#0369A1' },
      { icon: 'flame', title: 'Boiler service', text: 'Safe, certified, warm.', tint: '#FFEDD5', ink: '#C2410C' },
      { icon: 'wrench', title: 'Drain unblocking', text: 'Cleared with no mess.', tint: '#DCFCE7', ink: '#15803D' },
    ],
    // labels on the wireframe boxes
    wires: { nav: 'NAV', h1: 'HEADLINE', img: 'IMAGE', cta: 'CTA', trust: 'REVIEWS', card: 'SERVICE' },
  },
};
