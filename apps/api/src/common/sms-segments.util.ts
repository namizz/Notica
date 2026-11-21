/**
 * Works out how a text will be encoded and split into SMS parts, using the
 * same rules as Android's SmsManager.divideMessage for the default alphabet:
 *
 * - GSM 03.38 7-bit: 160 septets in one part, 153 per part when split.
 *   Characters from the extension table (€ [ ] { } ~ ^ \ | and form feed)
 *   take two septets.
 * - Anything else forces UCS-2: 70 UTF-16 units in one part, 67 when split.
 *   An emoji is a surrogate pair and costs two units.
 *
 * Carriers that use national language shift tables can fit slightly more
 * text into a part, so this is an upper bound, which is what limits need.
 */

const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXTENSION = '\f^{}\\[~]|€';

const BASIC = new Set(GSM7_BASIC);
const EXTENSION = new Set(GSM7_EXTENSION);

export type SmsEncodingName = 'GSM7' | 'UCS2';

export interface SmsSegmentInfo {
  encoding: SmsEncodingName;
  /** Septets for GSM-7, UTF-16 code units for UCS-2. */
  units: number;
  parts: number;
}

const LIMITS: Record<SmsEncodingName, { single: number; multi: number }> = {
  GSM7: { single: 160, multi: 153 },
  UCS2: { single: 70, multi: 67 },
};

export function analyzeSms(text: string): SmsSegmentInfo {
  let septets = 0;
  let gsm = true;

  for (const char of text) {
    if (BASIC.has(char)) {
      septets += 1;
    } else if (EXTENSION.has(char)) {
      septets += 2;
    } else {
      gsm = false;
      break;
    }
  }

  const encoding: SmsEncodingName = gsm ? 'GSM7' : 'UCS2';
  const units = gsm ? septets : text.length;
  const limit = LIMITS[encoding];
  const parts =
    units === 0
      ? 1
      : units <= limit.single
        ? 1
        : Math.ceil(units / limit.multi);

  return { encoding, units, parts };
}
