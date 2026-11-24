/** "+15555550111" -> "+1 555 555 0111", "+919845000001" -> "+91 98450 00001"; anything else as it is. */
export function formatPhone(e164: string): string {
  const us = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  if (us) return `+1 ${us[1]} ${us[2]} ${us[3]}`;
  const india = /^\+91(\d{5})(\d{5})$/.exec(e164);
  if (india) return `+91 ${india[1]} ${india[2]}`;
  return e164;
}

/** "called" -> "Called". */
export function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
