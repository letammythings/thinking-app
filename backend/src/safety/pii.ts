export type PiiHit = {
  kinds: string[];
  warning: boolean;
};

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE = /(?<!\d)(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]*)\d{3}[\s.-]?\d{4}(?!\d)/;
const CARD = /\b(?:\d[ -]*?){13,19}\b/;
const OTP = /\b(?:verification code|otp|pin is|code is)\b.{0,12}\b\d{4,8}\b/i;
const ADDRESS = /\b\d{1,5}\s+\w+\s+(street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln)\b/i;

export function detectPii(raw: string): PiiHit {
  const kinds: string[] = [];
  if (EMAIL.test(raw)) kinds.push("email");
  if (PHONE.test(raw)) kinds.push("phone");
  if (CARD.test(raw.replace(/[-\s]/g, ""))) kinds.push("financial");
  if (OTP.test(raw)) kinds.push("verification_code");
  if (ADDRESS.test(raw)) kinds.push("address");
  if (/\b(password|passwd|pwd)\s*[:=]\s*\S+/.test(raw)) kinds.push("password");
  return { kinds, warning: kinds.length > 0 };
}
