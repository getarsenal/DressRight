import type { Rank } from '../types';

export const RANKS: Rank[] = [
  { id: 'PV2', abbr: 'PV2', name: 'Private', grade: 'E-2', category: 'enlisted', chevrons: { up: 1, rockers: 0 } },
  { id: 'PFC', abbr: 'PFC', name: 'Private First Class', grade: 'E-3', category: 'enlisted', chevrons: { up: 1, rockers: 1 } },
  { id: 'SPC', abbr: 'SPC', name: 'Specialist', grade: 'E-4', category: 'enlisted', chevrons: { up: 0, rockers: 0, device: 'eagle' } },
  { id: 'CPL', abbr: 'CPL', name: 'Corporal', grade: 'E-4', category: 'enlisted', chevrons: { up: 2, rockers: 0 } },
  { id: 'SGT', abbr: 'SGT', name: 'Sergeant', grade: 'E-5', category: 'enlisted', chevrons: { up: 3, rockers: 0 } },
  { id: 'SSG', abbr: 'SSG', name: 'Staff Sergeant', grade: 'E-6', category: 'enlisted', chevrons: { up: 3, rockers: 1 } },
  { id: 'SFC', abbr: 'SFC', name: 'Sergeant First Class', grade: 'E-7', category: 'enlisted', chevrons: { up: 3, rockers: 2 } },
  { id: 'MSG', abbr: 'MSG', name: 'Master Sergeant', grade: 'E-8', category: 'enlisted', chevrons: { up: 3, rockers: 3 } },
  { id: '1SG', abbr: '1SG', name: 'First Sergeant', grade: 'E-8', category: 'enlisted', chevrons: { up: 3, rockers: 3, device: 'diamond' } },
  { id: 'SGM', abbr: 'SGM', name: 'Sergeant Major', grade: 'E-9', category: 'enlisted', chevrons: { up: 3, rockers: 3, device: 'star' } },
  { id: 'CSM', abbr: 'CSM', name: 'Command Sergeant Major', grade: 'E-9', category: 'enlisted', chevrons: { up: 3, rockers: 3, device: 'wreath-star' } },
  { id: 'WO1', abbr: 'WO1', name: 'Warrant Officer 1', grade: 'W-1', category: 'warrant' },
  { id: 'CW2', abbr: 'CW2', name: 'Chief Warrant Officer 2', grade: 'W-2', category: 'warrant' },
  { id: 'CW3', abbr: 'CW3', name: 'Chief Warrant Officer 3', grade: 'W-3', category: 'warrant' },
  { id: 'CW4', abbr: 'CW4', name: 'Chief Warrant Officer 4', grade: 'W-4', category: 'warrant' },
  { id: 'CW5', abbr: 'CW5', name: 'Chief Warrant Officer 5', grade: 'W-5', category: 'warrant' },
  { id: '2LT', abbr: '2LT', name: 'Second Lieutenant', grade: 'O-1', category: 'officer' },
  { id: '1LT', abbr: '1LT', name: 'First Lieutenant', grade: 'O-2', category: 'officer' },
  { id: 'CPT', abbr: 'CPT', name: 'Captain', grade: 'O-3', category: 'officer' },
  { id: 'MAJ', abbr: 'MAJ', name: 'Major', grade: 'O-4', category: 'officer' },
  { id: 'LTC', abbr: 'LTC', name: 'Lieutenant Colonel', grade: 'O-5', category: 'officer' },
  { id: 'COL', abbr: 'COL', name: 'Colonel', grade: 'O-6', category: 'officer' },
  { id: 'BG', abbr: 'BG', name: 'Brigadier General', grade: 'O-7', category: 'officer' },
  { id: 'MG', abbr: 'MG', name: 'Major General', grade: 'O-8', category: 'officer' },
  { id: 'LTG', abbr: 'LTG', name: 'Lieutenant General', grade: 'O-9', category: 'officer' },
  { id: 'GEN', abbr: 'GEN', name: 'General', grade: 'O-10', category: 'officer' },
];

export const rankById = (id: string) => RANKS.find((r) => r.id === id) ?? RANKS[4];
export const isNCO = (r: Rank) => r.category === 'enlisted' && (r.chevrons?.up ?? 0) >= 2;
export const isGeneral = (r: Rank) => ['BG', 'MG', 'LTG', 'GEN'].includes(r.id);
