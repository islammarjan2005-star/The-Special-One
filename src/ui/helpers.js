export function ratingClass(r) {
  return r >= 80 ? 'r-great' : r >= 72 ? 'r-good' : r >= 62 ? 'r-ok' : 'r-poor';
}

export function formArrow(form) {
  if (form >= 2) return '🔥';
  if (form > 0) return '↑';
  if (form <= -2) return '🥶';
  if (form < 0) return '↓';
  return '–';
}

export function initials(name) {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
