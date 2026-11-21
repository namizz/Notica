import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Normalises a phone number to E.164 (`+251911234567`).
 *
 * Numbers must be written in international form with a leading `+`: Notica has
 * no country context for a recipient, so a local number such as `0911234567`
 * is ambiguous and rejected. Spaces, dashes, dots and brackets are allowed.
 * Returns null when the input is not a valid number.
 */
export function normalizeE164(input: string | null | undefined): string | null {
  const trimmed = input?.trim();
  if (!trimmed || !trimmed.startsWith('+')) {
    return null;
  }

  const parsed = parsePhoneNumberFromString(trimmed);
  if (!parsed || !parsed.isValid()) {
    return null;
  }

  return parsed.number;
}

/**
 * Hides the middle of a number for logs and the dashboard:
 * `+251911234567` -> `+2519•••4567`.
 */
export function maskPhone(e164: string | null | undefined): string {
  if (!e164) {
    return 'unknown number';
  }
  if (e164.length <= 8) {
    return `${e164.slice(0, 2)}•••${e164.slice(-2)}`;
  }
  return `${e164.slice(0, 5)}•••${e164.slice(-4)}`;
}
