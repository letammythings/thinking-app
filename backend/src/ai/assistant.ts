import type { Intent } from "../util/names.js";

export type Suggestion = {
  move: "ask_follow_up" | "share_experience" | "go_deeper" | "change_subject" | "end_gracefully";
  text: string;
};

function lastWords(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function suggestReplies(input: {
  lastMessage: string;
  intent: Intent | string;
}): Suggestion[] {
  const last = lastWords(input.lastMessage || "");
  const lower = last.toLowerCase();
  const out: Suggestion[] = [];

  if (/mov(ed|ing)|another country|abroad|immigrat/.test(lower)) {
    out.push({ move: "ask_follow_up", text: "What surprised you most?" });
    out.push({ move: "go_deeper", text: "Do you feel like you changed after moving?" });
    out.push({ move: "ask_follow_up", text: "Would you do it again?" });
    out.push({ move: "share_experience", text: "What was harder than you expected?" });
  } else if (/job|career|work|quit|left/.test(lower)) {
    out.push({ move: "ask_follow_up", text: "What made that clear for you?" });
    out.push({ move: "go_deeper", text: "What are you protecting by making this choice?" });
    out.push({ move: "share_experience", text: "I had a similar fork in the road — want me to share what it felt like?" });
  } else if (/friend|lonely|alone/.test(lower)) {
    out.push({ move: "ask_follow_up", text: "What does friendship look like for you now?" });
    out.push({ move: "go_deeper", text: "When did you last feel understood?" });
    out.push({ move: "share_experience", text: "I could tell you how I rebuilt a small circle, if that’s useful." });
  } else if (/food|breakfast|cook|eat/.test(lower)) {
    out.push({ move: "ask_follow_up", text: "What would you cook if I visited for one morning?" });
    out.push({ move: "go_deeper", text: "Is that food tied to a person or a place for you?" });
    out.push({ move: "share_experience", text: "Can I tell you what a normal breakfast looks like where I am?" });
  } else if (last.length < 8) {
    out.push({ move: "ask_follow_up", text: "What has been on your mind today?" });
    out.push({ move: "ask_follow_up", text: "Is there a story behind that?" });
    out.push({ move: "share_experience", text: "I can share something small from my side, if you want." });
  } else {
    const snippet = last.length > 80 ? `${last.slice(0, 76)}…` : last;
    out.push({ move: "ask_follow_up", text: "What led you there?" });
    out.push({ move: "go_deeper", text: "What do you wish more people understood about that?" });
    out.push({ move: "share_experience", text: "That stayed with me. Can I share a nearby experience?" });
    if (snippet) {
      out.push({ move: "ask_follow_up", text: "If you said that to a younger you, how would they react?" });
    }
  }

  if (input.intent === "just_listen") {
    out.unshift({
      move: "ask_follow_up",
      text: "I’m here. Do you want a question, or just space to keep going?",
    });
  }
  if (input.intent === "cultural_exchange") {
    out.push({
      move: "change_subject",
      text: "What’s something ordinary where you live that would surprise me?",
    });
  }

  out.push({
    move: "end_gracefully",
    text: "I’ve really liked this. I’m going to head out — thank you for talking with me.",
  });

  const seen = new Set<string>();
  return out.filter((s) => {
    if (seen.has(s.text)) return false;
    seen.add(s.text);
    return true;
  }).slice(0, 5);
}

export async function suggestWithOptionalLlm(
  input: { lastMessage: string; intent: string },
  apiKey?: string,
  model?: string,
): Promise<Suggestion[]> {
  const fallback = suggestReplies(input);
  if (!apiKey) return fallback;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || "gpt-4.1-mini",
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content:
              "You help a human continue a thoughtful conversation with a stranger. Return JSON {suggestions:[{move,text}]} with 4 items. Moves: ask_follow_up, share_experience, go_deeper, change_subject, end_gracefully. Never speak as if you will send the message. No sexual or dating framing.",
          },
          { role: "user", content: `Intent: ${input.intent}\nLast message: ${input.lastMessage}` },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return fallback;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}") as {
      suggestions?: Suggestion[];
    };
    if (parsed.suggestions?.length) return parsed.suggestions.slice(0, 5);
  } catch {
    return fallback;
  }
  return fallback;
}
