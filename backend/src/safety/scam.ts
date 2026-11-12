export type ScamResult = {
  score: number;
  labels: string[];
  warn: boolean;
};

const PAYMENT = [
  "gift card", "giftcard", "bitcoin", "crypto", "ethereum", "wallet address",
  "wire transfer", "western union", "cashapp", "cash app", "zelle", "venmo",
  "bank account", "routing number", "investment opportunity", "double your money",
  "send me money", "send money", "pay me", "wire me",
];

const OFF_PLATFORM = [
  "whatsapp", "telegram", "signal me", "text me at", "email me at",
  "move off", "talk elsewhere", "dm me on instagram",
];

const URGENCY = [
  "urgent", "right now", "immediately", "today only", "act now",
  "emergency", "hospital bill", "stranded",
];

const SECRECY = ["don't tell", "dont tell", "keep this secret", "between us only", "delete this"];
const CODES = ["verification code", "otp", "one time code", "2fa code", "sms code"];
const ROMANCE = ["my love", "you're my soulmate", "you are my soulmate", "destiny brought"];

function hits(text: string, list: string[]): string[] {
  return list.filter((w) => text.includes(w));
}

export function scoreScam(raw: string, extras?: { duplicate?: boolean; velocity?: number }): ScamResult {
  const text = raw.toLowerCase();
  const labels: string[] = [];
  let score = 0;

  const pay = hits(text, PAYMENT);
  const off = hits(text, OFF_PLATFORM);
  const urg = hits(text, URGENCY);
  const sec = hits(text, SECRECY);
  const code = hits(text, CODES);
  const rom = hits(text, ROMANCE);

  if (pay.length) {
    score += 0.34;
    labels.push("payment");
  }
  if (off.length) {
    score += 0.22;
    labels.push("off_platform");
  }
  if (urg.length) {
    score += 0.16;
    labels.push("urgency");
  }
  if (sec.length) {
    score += 0.12;
    labels.push("secrecy");
  }
  if (code.length) {
    score += 0.36;
    labels.push("codes");
  }
  if (rom.length && pay.length) {
    score += 0.2;
    labels.push("romance_bait");
  }
  if (pay.length && (urg.length || off.length || code.length || sec.length)) {
    score += 0.28;
    labels.push("solicitation_cluster");
  }
  if (/\bverif(y|ication)\b/.test(text) && pay.length) {
    score += 0.12;
    labels.push("account_verify_bait");
  }
  if (extras?.duplicate) {
    score += 0.2;
    labels.push("duplicate");
  }
  if ((extras?.velocity ?? 0) >= 8) {
    score += 0.18;
    labels.push("velocity");
  }

  // Ordinary money talk without solicitation
  if (
    pay.length === 0 &&
    /\b(rent|saving|budget|expensive|salary|job)\b/.test(text) &&
    !off.length &&
    !code.length
  ) {
    score = Math.min(score, 0.2);
  }

  score = Math.min(1, score);
  const threshold = Number(process.env.SCAM_SHIELD_THRESHOLD ?? 0.72);
  return { score, labels, warn: score >= threshold };
}
