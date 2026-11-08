/**
 * Branches with their primary/secondary colors (used for the ASU shoulder
 * straps, the branch insignia disk tint, and the 3D preview). Colors are
 * approximations for the preview, not color-standard references.
 */
export interface Branch {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  /** short glyph drawn on the generated branch insignia */
  glyph: string;
}

export const BRANCHES: Branch[] = [
  { id: 'IN', name: 'Infantry', primary: '#2b6cb0', secondary: '#ffffff', glyph: '⚔' },
  { id: 'AR', name: 'Armor', primary: '#f2c94c', secondary: '#38a169', glyph: '◆' },
  { id: 'FA', name: 'Field Artillery', primary: '#c53030', secondary: '#c53030', glyph: '✕' },
  { id: 'AD', name: 'Air Defense Artillery', primary: '#c53030', secondary: '#c53030', glyph: '▲' },
  { id: 'AV', name: 'Aviation', primary: '#3182ce', secondary: '#f2c94c', glyph: '✈' },
  { id: 'EN', name: 'Engineers', primary: '#c53030', secondary: '#ffffff', glyph: '♜' },
  { id: 'SC', name: 'Signal Corps', primary: '#ed8936', secondary: '#ffffff', glyph: '⚑' },
  { id: 'MI', name: 'Military Intelligence', primary: '#718096', secondary: '#2c5282', glyph: '✦' },
  { id: 'MP', name: 'Military Police', primary: '#38a169', secondary: '#f2c94c', glyph: '✕' },
  { id: 'CM', name: 'Chemical Corps', primary: '#2c5282', secondary: '#f2c94c', glyph: '⬡' },
  { id: 'LG', name: 'Logistics', primary: '#e53e3e', secondary: '#3182ce', glyph: '✱' },
  { id: 'QM', name: 'Quartermaster', primary: '#9b2c2c', secondary: '#f2c94c', glyph: '✱' },
  { id: 'OD', name: 'Ordnance', primary: '#9b2c2c', secondary: '#f2c94c', glyph: '●' },
  { id: 'TC', name: 'Transportation', primary: '#9b2c2c', secondary: '#f2c94c', glyph: '☸' },
  { id: 'AG', name: "Adjutant General's Corps", primary: '#2c5282', secondary: '#c53030', glyph: '★' },
  { id: 'FI', name: 'Finance Corps', primary: '#a0aec0', secondary: '#f2c94c', glyph: '◇' },
  { id: 'MC', name: 'Medical Corps', primary: '#805ad5', secondary: '#ffffff', glyph: '⚕' },
  { id: 'CY', name: 'Cyber Corps', primary: '#1a365d', secondary: '#a0aec0', glyph: '⌬' },
  { id: 'SF', name: 'Special Forces', primary: '#2f855a', secondary: '#2f855a', glyph: '⚔' },
  { id: 'PO', name: 'Psychological Operations', primary: '#2c5282', secondary: '#a0aec0', glyph: '♞' },
  { id: 'CA', name: 'Civil Affairs', primary: '#7b2d26', secondary: '#ffffff', glyph: '◈' },
  { id: 'JA', name: "Judge Advocate General's Corps", primary: '#2c5282', secondary: '#ffffff', glyph: '⚖' },
  { id: 'CH', name: 'Chaplain Corps', primary: '#1a202c', secondary: '#1a202c', glyph: '✝' },
];

export const branchById = (id: string) => BRANCHES.find((b) => b.id === id) ?? BRANCHES[0];
