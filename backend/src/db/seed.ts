import type { DatabaseSync } from "node:sqlite";
import { nowIso } from "../util/crypto.js";

type Db = DatabaseSync;

function run(db: Db, sql: string, ...params: Array<null | number | string>): void {
  db.prepare(sql).run(...params);
}

const categories = [
  ["life", "Life", "question"],
  ["relationships", "Relationships", "question"],
  ["friendship", "Friendship", "question"],
  ["career", "Career", "question"],
  ["travel", "Travel", "question"],
  ["culture", "Culture", "question"],
  ["family", "Family", "question"],
  ["money", "Money", "question"],
  ["confidence", "Confidence", "question"],
  ["growth", "Personal growth", "question"],
  ["philosophy", "Philosophy", "question"],
  ["food", "Food", "question"],
  ["childhood", "Childhood", "question"],
  ["dreams", "Dreams", "question"],
  ["moving", "Moving abroad", "question"],
  ["starting-over", "Starting over", "question"],
  ["random", "Random", "question"],
  ["funny", "Funny", "question"],
  ["deep", "Deep", "question"],
  ["hypothetical", "Hypothetical", "question"],
  ["advice", "Advice", "advice"],
  ["notes", "Notes", "note"],
];

const interests = [
  ["languages", "Languages"],
  ["food", "Food"],
  ["travel", "Travel"],
  ["psychology", "Psychology"],
  ["music", "Music"],
  ["books", "Books"],
  ["walking", "Walking"],
  ["cooking", "Cooking"],
  ["film", "Film"],
  ["making-things", "Making things"],
  ["cities", "Cities"],
  ["quiet", "Quiet places"],
  ["work", "Work and craft"],
  ["family", "Family"],
  ["faith", "Faith and meaning"],
  ["nature", "Nature"],
  ["sports", "Sports"],
  ["design", "Design"],
];

const countries = [
  ["US", "United States", "North America"],
  ["CA", "Canada", "North America"],
  ["MX", "Mexico", "North America"],
  ["BR", "Brazil", "South America"],
  ["AR", "Argentina", "South America"],
  ["GB", "United Kingdom", "Europe"],
  ["IE", "Ireland", "Europe"],
  ["FR", "France", "Europe"],
  ["DE", "Germany", "Europe"],
  ["IT", "Italy", "Europe"],
  ["ES", "Spain", "Europe"],
  ["PT", "Portugal", "Europe"],
  ["NL", "Netherlands", "Europe"],
  ["SE", "Sweden", "Europe"],
  ["PL", "Poland", "Europe"],
  ["TR", "Türkiye", "Europe / West Asia"],
  ["NG", "Nigeria", "Africa"],
  ["KE", "Kenya", "Africa"],
  ["ZA", "South Africa", "Africa"],
  ["EG", "Egypt", "Africa"],
  ["IN", "India", "Asia"],
  ["PK", "Pakistan", "Asia"],
  ["BD", "Bangladesh", "Asia"],
  ["CN", "China", "Asia"],
  ["JP", "Japan", "Asia"],
  ["KR", "South Korea", "Asia"],
  ["VN", "Vietnam", "Asia"],
  ["TH", "Thailand", "Asia"],
  ["PH", "Philippines", "Asia"],
  ["ID", "Indonesia", "Asia"],
  ["AU", "Australia", "Oceania"],
  ["NZ", "New Zealand", "Oceania"],
  ["AE", "United Arab Emirates", "West Asia"],
];

const languages = [
  ["en", "English"],
  ["es", "Spanish"],
  ["fr", "French"],
  ["de", "German"],
  ["pt", "Portuguese"],
  ["ar", "Arabic"],
  ["hi", "Hindi"],
  ["bn", "Bengali"],
  ["zh", "Chinese"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
  ["vi", "Vietnamese"],
  ["th", "Thai"],
  ["id", "Indonesian"],
  ["tr", "Turkish"],
  ["it", "Italian"],
  ["nl", "Dutch"],
  ["pl", "Polish"],
  ["sw", "Swahili"],
  ["fa", "Persian"],
];

const questions: Array<[string, string, string, number]> = [
  ["life", "What is something you believe now that you didn’t believe five years ago?", "daily", 1],
  ["culture", "What does a normal Sunday look like where you live?", "culture", 1],
  ["culture", "What is something about your culture that outsiders often misunderstand?", "culture", 1],
  ["growth", "What is a lesson you learned the hard way?", "general", 0],
  ["life", "What is something you’re currently trying to figure out?", "general", 1],
  ["growth", "What is something you wish someone told you at 25?", "general", 0],
  ["moving", "What surprised you most after moving somewhere new?", "culture", 0],
  ["food", "What is a normal breakfast where you live?", "culture", 0],
  ["culture", "What is considered rude in your culture that visitors rarely notice?", "culture", 0],
  ["childhood", "What did you do for fun as a child?", "culture", 0],
  ["friendship", "How did you make friends after a chapter of your life ended?", "advice", 0],
  ["career", "How did you know it was time to leave a job — or stay?", "advice", 0],
  ["confidence", "How did you become more comfortable talking to strangers?", "advice", 0],
  ["starting-over", "What did starting over actually feel like, not the highlight reel?", "general", 0],
  ["family", "What is a family tradition you kept — or quietly let go?", "general", 0],
  ["money", "What is a money lesson you learned later than you wanted to?", "general", 0],
  ["philosophy", "When do you feel most like yourself?", "deep", 0],
  ["dreams", "What are you quietly hoping for this year?", "general", 0],
  ["funny", "What tiny thing instantly tells you you’re home?", "random", 0],
  ["hypothetical", "If you could ask one honest question to a stranger across the world, what would it be?", "hypothetical", 0],
  ["travel", "Where did you feel unexpectedly welcome?", "culture", 0],
  ["relationships", "What does care look like in your everyday life?", "general", 0],
  ["deep", "What are you unlearning?", "deep", 0],
  ["life", "What is a small ritual that steadies you?", "daily", 0],
];

const notes = [
  ["thought", "I realized today that I don’t miss my old life. I miss who I was when I lived it."],
  ["lesson", "Being kind and being available are not the same skill."],
  ["observation", "The grocery store at 8am is one of the most honest places in a city."],
  ["quote", "Curiosity is a form of respect."],
  ["thought", "I still don’t know if I am brave or just tired of waiting."],
];

export function seedReferenceData(db: Db): void {
  const existing = db.prepare("SELECT slug FROM categories LIMIT 1").get();
  if (existing) return;

  const t = nowIso();
  categories.forEach(([slug, name, kind], i) => {
    run(
      db,
      "INSERT INTO categories (id, slug, name, kind, sort_order) VALUES (?, ?, ?, ?, ?)",
      slug,
      slug,
      name,
      kind,
      i,
    );
  });
  interests.forEach(([slug, name], i) => {
    run(db, "INSERT INTO interests (slug, name, sort_order) VALUES (?, ?, ?)", slug, name, i);
  });
  countries.forEach(([code, name, region]) => {
    run(db, "INSERT INTO countries (code, name, region) VALUES (?, ?, ?)", code, name, region);
  });
  languages.forEach(([code, name]) => {
    run(db, "INSERT INTO languages (code, name) VALUES (?, ?)", code, name);
  });

  const today = t.slice(0, 10);
  questions.forEach(([category, prompt, kind, featured], i) => {
    run(
      db,
      `INSERT INTO questions (id, category_id, prompt, kind, is_featured, featured_on, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'published', ?)`,
      crypto.randomUUID(),
      category,
      prompt,
      kind,
      featured,
      featured && i === 0 ? today : null,
      t,
    );
  });

  notes.forEach(([kind, body]) => {
    run(
      db,
      `INSERT INTO notes (id, author_identity_id, body, kind, replies_allowed, conversation_allowed, status, created_at)
       VALUES (?, NULL, ?, ?, 1, 1, 'published', ?)`,
      crypto.randomUUID(),
      body,
      kind,
      t,
    );
  });
}
