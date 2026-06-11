// Static game data: the 20 league clubs and the name banks used to
// generate fictional players. Club names are fictionalized; no real
// player data is used anywhere.

// tier 1 = title contenders, 2 = european hopefuls, 3 = mid-table, 4 = strugglers
// baseRating anchors squad generation; budgets/wages in £.
export const CLUBS = [
  { id: 'MCB', name: 'Manchester Blue', short: 'Man Blue', tier: 1, baseRating: 84, transferBudget: 180e6, wageBudget: 3500000, color: '#6CABDD', expectation: 1 },
  { id: 'LIV', name: 'Liverpool Reds', short: 'Liverpool', tier: 1, baseRating: 83, transferBudget: 140e6, wageBudget: 3200000, color: '#C8102E', expectation: 2 },
  { id: 'ARS', name: 'North London Arsenal', short: 'Arsenal', tier: 1, baseRating: 83, transferBudget: 150e6, wageBudget: 3100000, color: '#EF0107', expectation: 3 },
  { id: 'CHE', name: 'West London Blues', short: 'Chelsea', tier: 1, baseRating: 81, transferBudget: 160e6, wageBudget: 3000000, color: '#034694', expectation: 4 },
  { id: 'MUR', name: 'Manchester Red', short: 'Man Red', tier: 2, baseRating: 80, transferBudget: 120e6, wageBudget: 3300000, color: '#DA291C', expectation: 5 },
  { id: 'TOT', name: 'Tottenham Spurs', short: 'Spurs', tier: 2, baseRating: 79, transferBudget: 100e6, wageBudget: 2400000, color: '#132257', expectation: 6 },
  { id: 'NEW', name: 'Newcastle Magpies', short: 'Newcastle', tier: 2, baseRating: 79, transferBudget: 110e6, wageBudget: 2300000, color: '#241F20', expectation: 7 },
  { id: 'AVL', name: 'Aston Villains', short: 'Villa', tier: 2, baseRating: 78, transferBudget: 80e6, wageBudget: 2100000, color: '#670E36', expectation: 8 },
  { id: 'BHA', name: 'Brighton Seagulls', short: 'Brighton', tier: 3, baseRating: 76, transferBudget: 60e6, wageBudget: 1500000, color: '#0057B8', expectation: 9 },
  { id: 'WHU', name: 'East London Hammers', short: 'Hammers', tier: 3, baseRating: 75, transferBudget: 55e6, wageBudget: 1700000, color: '#7A263A', expectation: 10 },
  { id: 'CRY', name: 'Crystal Eagles', short: 'Palace', tier: 3, baseRating: 75, transferBudget: 45e6, wageBudget: 1400000, color: '#1B458F', expectation: 11 },
  { id: 'BRE', name: 'Brentford Bees', short: 'Brentford', tier: 3, baseRating: 74, transferBudget: 40e6, wageBudget: 1200000, color: '#E30613', expectation: 12 },
  { id: 'FUL', name: 'Fulham Riverside', short: 'Fulham', tier: 3, baseRating: 74, transferBudget: 45e6, wageBudget: 1300000, color: '#1D1D1B', expectation: 13 },
  { id: 'WOL', name: 'Wolverton Wanderers', short: 'Wolves', tier: 3, baseRating: 73, transferBudget: 35e6, wageBudget: 1200000, color: '#FDB913', expectation: 14 },
  { id: 'EVE', name: 'Everton Toffees', short: 'Everton', tier: 4, baseRating: 73, transferBudget: 30e6, wageBudget: 1300000, color: '#003399', expectation: 15 },
  { id: 'BOU', name: 'Bournemouth Cherries', short: 'Cherries', tier: 4, baseRating: 72, transferBudget: 30e6, wageBudget: 1000000, color: '#DA291C', expectation: 16 },
  { id: 'NOT', name: 'Nottingham Forest Green', short: 'Forest', tier: 4, baseRating: 72, transferBudget: 28e6, wageBudget: 1000000, color: '#DD0000', expectation: 17 },
  { id: 'LEI', name: 'Leicester Foxes', short: 'Foxes', tier: 4, baseRating: 71, transferBudget: 25e6, wageBudget: 900000, color: '#003090', expectation: 18 },
  { id: 'SOU', name: 'Southampton Saints', short: 'Saints', tier: 4, baseRating: 70, transferBudget: 20e6, wageBudget: 800000, color: '#D71920', expectation: 19 },
  { id: 'IPS', name: 'Ipswich Tractor Boys', short: 'Ipswich', tier: 4, baseRating: 69, transferBudget: 15e6, wageBudget: 700000, color: '#3A64A3', expectation: 20 },
];

// The three clubs offered at career start: rich / mid-table / broke.
export const STARTER_CLUB_IDS = ['CHE', 'BHA', 'IPS'];

// Derby pairs (by club id) — results between these trigger headline cards.
export const DERBIES = [
  ['MCB', 'MUR'],
  ['LIV', 'EVE'],
  ['ARS', 'TOT'],
  ['CHE', 'FUL'],
  ['WHU', 'TOT'],
  ['CRY', 'BHA'],
];

export const FIRST_NAMES = [
  'Jack', 'Harry', 'Ollie', 'Charlie', 'Alfie', 'Freddie', 'Archie', 'Theo',
  'Marcus', 'Jude', 'Declan', 'Mason', 'Reece', 'Cole', 'Kobbie', 'Levi',
  'Bruno', 'Diogo', 'João', 'Pedro', 'Rúben', 'Matheus', 'Gabriel', 'Lucas',
  'Kevin', 'Youri', 'Leandro', 'Timo', 'Kai', 'Florian', 'Niclas', 'Jamal',
  'Mohamed', 'Riyad', 'Yves', 'Cheick', 'Ibrahima', 'Moussa', 'Sékou', 'Amadou',
  'Erling', 'Martin', 'Viktor', 'Mikkel', 'Rasmus', 'Oscar', 'Emil', 'Anders',
  'Mateo', 'Nicolás', 'Julián', 'Enzo', 'Alexis', 'Rodrigo', 'Facundo', 'Thiago',
  'Takumi', 'Kaoru', 'Hee-chan', 'Wataru', 'Dominik', 'Milos', 'Dusan', 'Luka',
];

export const LAST_NAMES = [
  'Kane', 'Sterling', 'Walker', 'Stones', 'Foden', 'Grealish', 'Rashford', 'Saka',
  'Wilson', 'Johnson', 'Robertson', 'Henderson', 'Davies', 'Edwards', 'Hughes', 'Price',
  'Sonsby', 'Bellington', 'Toney', 'Mbeumo', 'Watkins', 'Bowen', 'Maddison', 'Barnes',
  'Silva', 'Fernandes', 'Martins', 'Costa', 'Moreira', 'Almeida', 'Carvalho', 'Neves',
  'Haalsen', 'Ødegard', 'Larsson', 'Nielsen', 'Johansen', 'Berge', 'Strand', 'Sørli',
  'Díaz', 'Álvarez', 'Romero', 'Mac Allister', 'Fernández', 'Castellanos', 'Giménez', 'Herrera',
  'Diallo', 'Traoré', 'Koulibaly', 'Mané', 'Sarr', 'Camara', 'Keita', 'Cissé',
  'Šimić', 'Kovačić', 'Petrović', 'Janković', 'Szabó', 'Nagy', 'Horváth', 'Müller',
  'Onana', 'Mbappi', 'Zinchen', 'Gundo', 'Vardyman', 'Shawcross', 'Trippley', 'Pickfield',
];
