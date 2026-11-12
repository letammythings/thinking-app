const ADJECTIVES = [
  "Quiet", "Blue", "Paper", "Soft", "Amber", "Hidden", "Kind", "Distant",
  "Gentle", "Curious", "Still", "Warm", "Open", "Brave", "Slow", "Bright",
  "Faded", "Wild", "Tender", "Honest", "North", "Late", "Early", "Silver",
  "Cedar", "Moss", "Coral", "Iron", "Lucky", "Humble",
];

const NOUNS = [
  "Lantern", "Crane", "Explorer", "Harbor", "Meadow", "Compass", "Thread",
  "Ember", "Atlas", "Quill", "Porch", "River", "Sparrow", "Maple", "Horizon",
  "Notebook", "Traveler", "Oak", "Tide", "Lark", "Kettle", "Window", "Bridge",
  "Orchard", "Beacon", "Satchel", "Willow", "Current", "Hearth", "Trail",
];

export function generateDisplayName(seed = Math.random()): string {
  const a = ADJECTIVES[Math.floor(seed * 997) % ADJECTIVES.length];
  const n = NOUNS[Math.floor(seed * 991) % NOUNS.length];
  return `${a} ${n}`;
}

export const INTENTS = [
  "just_talk",
  "ask_me_questions",
  "advice_wanted",
  "just_listen",
  "friendly_discussion",
  "open_debate",
  "cultural_exchange",
] as const;

export type Intent = (typeof INTENTS)[number];

export const REPORT_CATEGORIES = [
  "harassment",
  "bullying",
  "threats",
  "sexual_content",
  "hate",
  "scam",
  "asking_for_money",
  "impersonation",
  "spam",
  "personal_information",
  "other",
] as const;
