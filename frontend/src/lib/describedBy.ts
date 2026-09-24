/** Joins the ids of help and error text for aria-describedby (skips missing ones). */
export function describedBy(...ids: (string | false | undefined)[]): string | undefined {
  const joined = ids.filter(Boolean).join(' ');
  return joined || undefined;
}
