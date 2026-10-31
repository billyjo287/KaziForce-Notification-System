/** "Wanjiru Kamau" → "WK": the round avatar in the top bar and sidebar. */
export const initialsOf = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
