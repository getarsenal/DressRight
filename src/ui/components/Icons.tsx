/** Minimal inline icon set (stroke icons, 24px grid). */
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const Icon = {
  coat: () => (
    <svg viewBox="0 0 24 24" {...P}><path d="M8 3l4 3 4-3 4 2 1 15h-5l-1-7-3 3-3-3-1 7H3L4 5z" /><path d="M12 6v15" /></svg>
  ),
  medal: () => (
    <svg viewBox="0 0 24 24" {...P}><path d="M7 3h10l-3 7h-4z" /><circle cx="12" cy="15.5" r="5" /><path d="M12 13.2l.9 1.8 2 .3-1.4 1.4.3 2-1.8-1-1.8 1 .3-2-1.4-1.4 2-.3z" /></svg>
  ),
  shield: () => (
    <svg viewBox="0 0 24 24" {...P}><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></svg>
  ),
  ask: () => (
    <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 015 0c0 1.7-2.5 2-2.5 4" /><path d="M12 17h.01" /></svg>
  ),
  more: () => (
    <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1-3.5 3.8-5.5 7-5.5s6 2 7 5.5" /></svg>
  ),
  ruler: () => (
    <svg viewBox="0 0 24 24" {...P}><path d="M3 17L17 3l4 4L7 21z" /><path d="M7 13l2 2M10 10l2 2M13 7l2 2" /></svg>
  ),
  reset: () => (
    <svg viewBox="0 0 24 24" {...P}><path d="M4 12a8 8 0 108-8 8.5 8.5 0 00-6 2.5L4 8" /><path d="M4 3v5h5" /></svg>
  ),
  plus: () => (
    <svg viewBox="0 0 24 24" {...P}><path d="M12 5v14M5 12h14" /></svg>
  ),
  minus: () => (
    <svg viewBox="0 0 24 24" {...P}><path d="M5 12h14" /></svg>
  ),
  x: () => (
    <svg viewBox="0 0 24 24" {...P}><path d="M6 6l12 12M18 6L6 18" /></svg>
  ),
  check: () => (
    <svg viewBox="0 0 24 24" {...P}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
  ),
  chevron: () => (
    <svg viewBox="0 0 24 24" {...P}><path d="M9 6l6 6-6 6" /></svg>
  ),
  back: () => (
    <svg viewBox="0 0 24 24" {...P}><path d="M15 6l-6 6 6 6" /></svg>
  ),
  search: () => (
    <svg viewBox="0 0 24 24" {...P}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
  ),
  alert: () => (
    <svg viewBox="0 0 24 24" {...P}><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4M12 17h.01" /></svg>
  ),
  up: () => (
    <svg viewBox="0 0 24 24" {...P}><path d="M6 15l6-6 6 6" /></svg>
  ),
};
