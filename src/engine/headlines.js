// Tabloid headline generator. Pure template engine (no LLM) behind a
// swappable interface: generateHeadline(context) -> { headline, sub }.
//
// Pun fragments are keyed to syllables in the key player's surname; when
// one matches, a pun headline takes priority over the generic bank.

import { pick, next } from './rng.js';

// syllable -> headline template. {NAME} = surname uppercased, {CLUB} = club short name.
const PUN_FRAGMENTS = [
  { syl: 'kane', tmpl: '{NAME} IS ABLE!' },
  { syl: 'son', tmpl: '{NAME} SHINES BRIGHTER THAN THE SUN' },
  { syl: 'ster', tmpl: '{NAME} STIRS UP A STORM' },
  { syl: 'wood', tmpl: '{NAME} KNOCKS ON WOOD — AND IT OPENS' },
  { syl: 'silva', tmpl: 'SILVA SERVICE FROM {NAME}' },
  { syl: 'gold', tmpl: 'PURE GOLD FROM {NAME}' },
  { syl: 'king', tmpl: '{NAME} IS KING OF {CLUB}' },
  { syl: 'wright', tmpl: 'MR {NAME} DOES IT RIGHT' },
  { syl: 'walk', tmpl: '{NAME} WALKS IT IN' },
  { syl: 'stone', tmpl: '{NAME} LEAVES THEM STONE COLD' },
  { syl: 'bell', tmpl: '{NAME} RINGS THE BELL' },
  { syl: 'fox', tmpl: '{NAME} OUTFOXES THEM ALL' },
  { syl: 'wolf', tmpl: '{NAME} HOWLS AT THE MOON' },
  { syl: 'cross', tmpl: '{NAME} MAKES THEM CROSS' },
  { syl: 'price', tmpl: '{NAME} IS PRICELESS' },
  { syl: 'day', tmpl: '{NAME} SAVES THE DAY' },
  { syl: 'mar', tmpl: '{NAME}-VELLOUS!' },
  { syl: 'sen', tmpl: 'SENSATIONAL {NAME}!' },
  { syl: 'man', tmpl: 'SUPER{NAME} TO THE RESCUE' },
  { syl: 'ney', tmpl: '{NAME} NEIGHS LAST' },
];

// Generic banks per moment type. Slots: {CLUB} {OPP} {SCORE} {PLAYER}
// {STREAK} {POS} — filled from the context.
const BANK = {
  bigWin: [
    'GIANT KILLERS!',
    '{CLUB} STUN {OPP}',
    'DAVID 1, GOLIATH 0',
    'SHOCK AND AWE AT {OPP}',
    'WHO SAW THAT COMING?',
    '{CLUB} TEAR UP THE SCRIPT',
  ],
  win: [
    '{CLUB} MARCH ON',
    'THREE MORE POINTS IN THE BAG',
    '{CLUB} TOO HOT TO HANDLE',
    'JOB DONE FOR {CLUB}',
  ],
  thrashing: [
    '{SCORE}! {CLUB} RUN RIOT',
    'DEMOLITION DERBY: {CLUB} CRUSH {OPP}',
    'NO MERCY! {CLUB} HIT {OPP} FOR SIX',
    '{OPP} TORN TO SHREDS',
  ],
  heavyDefeat: [
    'HUMILIATED!',
    '{CLUB} HIT ROCK BOTTOM',
    'EMBARRASSING! {OPP} RUN RIOT',
    'CRISIS? WHAT CRISIS… OK, CRISIS',
    'BACK TO THE DRAWING BOARD',
  ],
  derbyWin: [
    'BRAGGING RIGHTS SECURED!',
    'DERBY DAY DELIGHT FOR {CLUB}',
    'LOCAL HEROES! {CLUB} SILENCE {OPP}',
    'THE CITY IS OURS',
  ],
  derbyLoss: [
    'DERBY DAY DISASTER',
    '{OPP} PAINT THE TOWN THEIR COLOUR',
    'NIGHTMARE NEXT DOOR',
  ],
  streak: [
    '{STREAK} AND COUNTING!',
    'UNSTOPPABLE! {CLUB} MAKE IT {STREAK}',
    'CAN ANYBODY STOP {CLUB}?',
  ],
  title: [
    'CHAMPIONS!!!',
    'PERFECT SEASON? PRETTY CLOSE!',
    '{CLUB} ON TOP OF THE WORLD',
    'GLORY GLORY {CLUB}',
  ],
  europe: [
    'EUROPE, HERE WE COME!',
    '{CLUB} BOOK THEIR EURO TRIP',
    'PASSPORTS AT THE READY',
  ],
  relegated: [
    'DOWN AND OUT',
    'TRAPDOOR OPENS FOR {CLUB}',
    'GOING DOWN: {CLUB} RELEGATED',
  ],
  survived: [
    'GREAT ESCAPE COMPLETE',
    '{CLUB} LIVE TO FIGHT ANOTHER DAY',
    'SAFETY! {CLUB} BEAT THE DROP',
  ],
  sacked: [
    'GAFFER GONE',
    'BOARD RUNS OUT OF PATIENCE',
    'P45 AT THE TRAINING GROUND',
  ],
  gem: [
    'BARGAIN OF THE CENTURY?',
    'SCOUTS STRIKE GOLD',
    'WHO IS THIS KID?',
  ],
  midtable: [
    'SOLID SEASON FOR {CLUB}',
    'STEADY AS SHE GOES',
    '{CLUB} FINISH {POS}',
  ],
};

const SUBS = {
  bigWin: ['{PLAYER} the hero as {CLUB} beat {OPP} {SCORE}', '{OPP} left stunned by {SCORE} defeat'],
  win: ['{PLAYER} on target in {SCORE} win over {OPP}', '{CLUB} see off {OPP} {SCORE}'],
  thrashing: ['{PLAYER} leads the rout as {OPP} collapse {SCORE}', 'Ruthless {CLUB} dismantle {OPP} {SCORE}'],
  heavyDefeat: ['{CLUB} fall apart in {SCORE} defeat to {OPP}', 'Questions for the manager after {SCORE} loss'],
  derbyWin: ['{PLAYER} settles the derby — {CLUB} {SCORE} winners over {OPP}'],
  derbyLoss: ['{OPP} take the spoils {SCORE} in a bitter derby'],
  streak: ['{PLAYER} keeps the run alive against {OPP} ({SCORE})'],
  title: ['{CLUB} crowned champions after a {POS}-place finish — wait, FIRST place finish'],
  europe: ['A {POS}-place finish sends {CLUB} into Europe'],
  relegated: ['A {POS}-place finish condemns {CLUB} to the drop'],
  survived: ['{CLUB} finish {POS} and stay up'],
  sacked: ['The board has sacked the manager with the club sitting {POS}'],
  gem: ['{CLUB} scouts unearth {PLAYER} for peanuts'],
  midtable: ['{CLUB} wrap up the season in {POS} place'],
};

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function fill(tmpl, ctx) {
  return tmpl
    .replace(/\{CLUB\}/g, ctx.club ?? '')
    .replace(/\{OPP\}/g, ctx.opponent ?? '')
    .replace(/\{SCORE\}/g, ctx.score ?? '')
    .replace(/\{PLAYER\}/g, ctx.player ?? '')
    .replace(/\{STREAK\}/g, ctx.streak != null ? `${ctx.streak} WINS` : '')
    .replace(/\{POS\}/g, ctx.position != null ? ordinal(ctx.position) : '')
    .replace(/\{NAME\}/g, (ctx.player ?? '').split(' ').pop().toUpperCase());
}

function punFor(rng, ctx) {
  if (!ctx.player) return null;
  const surname = ctx.player.split(' ').pop().toLowerCase();
  const matches = PUN_FRAGMENTS.filter((f) => surname.includes(f.syl));
  if (matches.length === 0) return null;
  return fill(pick(rng, matches).tmpl, ctx);
}

// type: keyof BANK. ctx: { club, opponent, score, player, streak, position }
export function generateHeadline(rng, type, ctx) {
  const positiveTypes = ['bigWin', 'win', 'thrashing', 'derbyWin', 'streak', 'title', 'europe', 'gem'];
  let headline = null;
  // Pun headlines fire ~70% of the time when a fragment matches a positive moment.
  if (positiveTypes.includes(type) && next(rng) < 0.7) headline = punFor(rng, ctx);
  if (!headline) headline = fill(pick(rng, BANK[type] ?? BANK.win), ctx);
  const sub = fill(pick(rng, SUBS[type] ?? SUBS.win), ctx);
  return { headline, sub, type, ctx };
}

// Decide whether a player-match result deserves a back page, and which kind.
export function headlineTypeForResult({ won, lost, goalsFor, goalsAgainst, isDerby, oppTier, myTier, streak }) {
  const margin = Math.abs(goalsFor - goalsAgainst);
  if (won && isDerby) return 'derbyWin';
  if (lost && isDerby) return 'derbyLoss';
  if (won && margin >= 4) return 'thrashing';
  if (lost && margin >= 4) return 'heavyDefeat';
  if (won && oppTier < myTier) return 'bigWin';
  if (won && streak >= 4) return 'streak';
  return null;
}
