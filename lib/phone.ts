/**
 * Normalizes a Ugandan phone number to the canonical stored form "+2567XXXXXXXX".
 * Accepts "+2567XXXXXXXX", "2567XXXXXXXX", "07XXXXXXXX" or "7XXXXXXXX".
 * Returns null when the input can't be normalized.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");

  let national = digits;
  if (national.startsWith("256") && national.length === 12) {
    national = national.slice(3);
  } else if (national.startsWith("0")) {
    national = national.slice(1);
  }

  if (!/^\d{9}$/.test(national)) return null;
  return `+256${national}`;
}
