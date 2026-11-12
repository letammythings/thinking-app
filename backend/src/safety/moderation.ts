export type Severity = "green" | "yellow" | "orange" | "red";

export type ModerationResult = {
  level: Severity;
  labels: string[];
  confidence: number;
  action: "allow" | "warn" | "hold" | "hide" | "suspend_pending_review";
};

const INSULTS = [
  "stupid", "idiot", "loser", "pathetic", "worthless", "ugly", "dumb",
  "trash", "disgusting", "incompetent",
];

const SLURS = [
  "retard", "retarded", "faggot", "nigger", "kike", "spic", "tranny",
];

const THREAT_VERBS = [
  "kill you", "hurt you", "stab you", "shoot you", "beat you",
  "i'm going to hurt you", "i will hurt you", "i will kill you",
  "i'm going to kill you", "find you and", "rape you",
];

const SELF_HARM = [
  "kill myself", "hurt myself", "end my life", "want to die", "suicide",
];

const SEXUAL_SOLICIT = [
  "send nudes", "send pics", "sex with me", "hook up", "show me your",
];

function includesAny(text: string, list: string[]): string | null {
  return list.find((w) => text.includes(w)) ?? null;
}

export function moderateText(raw: string): ModerationResult {
  const text = raw.toLowerCase().replace(/\s+/g, " ").trim();
  const labels: string[] = [];
  let level: Severity = "green";
  let confidence = 0.55;
  let action: ModerationResult["action"] = "allow";

  const directed = /\b(you|you're|you are|your)\b/.test(text);
  const firstPerson = /\b(i|i'm|im|me|my)\b/.test(text);
  const excitedSelf =
    firstPerson &&
    /\b(excited|happy|love|amazing|great|awesome|thrilled)\b/.test(text) &&
    !directed;

  const slur = includesAny(text, SLURS);
  if (slur) {
    labels.push("hate");
    level = "orange";
    confidence = 0.9;
    action = "hold";
  }

  const threat = includesAny(text, THREAT_VERBS);
  if (threat) {
    labels.push("threat");
    level = "red";
    confidence = 0.93;
    action = "suspend_pending_review";
  } else if (directed && /\b(hurt|kill|stab|shoot|destroy)\b/.test(text) && /\byou\b/.test(text)) {
    labels.push("threat");
    level = "red";
    confidence = 0.86;
    action = "hide";
  }

  const selfHarm = includesAny(text, SELF_HARM);
  if (selfHarm && !threat) {
    labels.push("self_harm");
    level = level === "green" ? "yellow" : level;
    confidence = Math.max(confidence, 0.7);
    if (action === "allow") action = "warn";
  }

  const insult = includesAny(text, INSULTS);
  if (directed && insult && !excitedSelf) {
    labels.push("harassment");
    if (level === "green" || level === "yellow") {
      level = "orange";
      confidence = 0.82;
      action = "hold";
    }
  }

  const sexual = includesAny(text, SEXUAL_SOLICIT);
  if (sexual) {
    labels.push("sexual_solicitation");
    if (level === "green" || level === "yellow") {
      level = "orange";
      confidence = 0.8;
      action = "hold";
    }
  }

  if (/\bfuck(ing)?\b/.test(text) && excitedSelf && labels.length === 0) {
    return { level: "green", labels: ["expressive"], confidence: 0.8, action: "allow" };
  }

  if (level === "green" && /\b(fuck|shit|damn|ass)\b/.test(text) && !directed) {
    return { level: "green", labels: ["expressive"], confidence: 0.75, action: "allow" };
  }

  return { level, labels, confidence, action };
}

export function shouldAutoSuspend(result: ModerationResult): boolean {
  return result.level === "red" && result.confidence >= 0.9 && result.labels.includes("threat");
}
