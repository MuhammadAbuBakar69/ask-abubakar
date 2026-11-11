/**
 * Retrieval and answer composition over a knowledge base of public repository facts.
 *
 * Why not an LLM: the honest answer to "what has he built" is a lookup, not a generation. A model here
 * would need an API key on a public page (the key leaks) or a paid proxy, and it would still be able to
 * invent a project that does not exist. Everything below is deterministic, runs in the visitor's browser,
 * costs nothing, and cites the repository it came from. The optional LLM layer only rewrites what this
 * returns; it can never add a fact.
 */

const STOPWORDS = new Set(("a an the and or of for to in on with about is are was were do does did " +
  "he his him they them their you your i me my what which who whom how many much does did can could " +
  "tell show give list please any some that this these those from at by as it its be been being has " +
  "have had will would should may might want know like more most other than then there here").split(" "));

export function tokenize(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .split(" ")
    .map((t) => t.replace(/^[.]+|[.]+$/g, ""))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

/** Deliberately crude, and only when it cannot corrupt a product name: "agents" → "agent". */
function stem(word) {
  if (word.length <= 4 || /[0-9]/.test(word)) return word;
  if (word.endsWith("ies") && word.length > 5) return `${word.slice(0, -3)}y`;
  if (word.endsWith("ing") && word.length > 6) return word.slice(0, -3);
  if (word.endsWith("es") && word.length > 5) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

const FIELD_WEIGHTS = { title: 8, topics: 4, stack: 4, summary: 2.5, body: 1, links: 1 };

function haystacks(entry) {
  return {
    title: tokenize(entry.title),
    topics: tokenize((entry.topics ?? []).join(" ")),
    stack: tokenize((entry.stack ?? []).join(" ")),
    summary: tokenize(entry.summary ?? ""),
    body: tokenize(entry.body ?? ""),
    links: tokenize((entry.url ?? "").split("/").pop() ?? ""),
  };
}

export function scoreEntry(entry, terms) {
  const fields = haystacks(entry);
  let score = 0;
  for (const term of terms) {
    for (const [field, tokens] of Object.entries(fields)) {
      const hits = tokens.filter((t) => t === term).length;
      if (hits) score += FIELD_WEIGHTS[field] * (1 + Math.log(hits));
      // partial credit for a longer query token inside a field token, e.g. "threadmind" in "threadmind"
      else if (term.length > 5 && tokens.some((t) => t.includes(term) || term.includes(t))) {
        score += FIELD_WEIGHTS[field] * 0.35;
      }
    }
  }
  return score;
}

/** Entries whose declared stack or topics include a term. Field-scoped, so a README mention cannot qualify. */
export function byTechnology(kb, terms, limit = 5) {
  const wanted = new Set(terms);
  return (kb.entries ?? [])
    .filter((entry) => entry.kind === "repo")
    .filter((entry) =>
      [...(entry.stack ?? []), ...(entry.topics ?? [])]
        .map((value) => stem(String(value).toLowerCase()))
        .some((value) => wanted.has(value)),
    )
    .slice(0, limit);
}

export function search(kb, question, limit = 3) {
  const terms = tokenize(question);
  if (terms.length === 0) return [];
  const scored = (kb.entries ?? [])
    .map((entry) => ({ entry, score: scoreEntry(entry, terms) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || (b.entry.updated ?? "").localeCompare(a.entry.updated ?? ""));
  return scored.slice(0, limit);
}

const INTENTS = [
  { id: "contact", test: /\b(contact|email|hire|hiring|reach|linkedin|available|freelance)\b/i },
  { id: "count", test: /\b(how many|number of|count)\b/i },
  { id: "latest", test: /\b(latest|recent|newest|working on|currently|now)\b/i },
  { id: "stack", test: /\b(what (tech|technolog|stack|language)|which (tech|language)|uses?|built with|written in)\b/i },
  { id: "identity", test: /\b(who is|who are you|about him|about abu|background|experience)\b/i },
];

function sourcesFrom(hits) {
  return hits
    .filter((h) => h.entry.url)
    .map((h) => ({ label: h.entry.title, url: h.entry.url }));
}

function fact(kb, key) {
  return (kb.entries ?? []).find((e) => e.id === `fact:${key}`);
}

/**
 * Returns { text, sources, confidence }. Confidence is the top score normalised against the best
 * achievable score for the query, so "do you know Rust" says it does not know instead of guessing.
 */
export function answer(kb, question) {
  const hits = search(kb, question, 4);
  const terms = tokenize(question);
  const intent = INTENTS.find((i) => i.test.test(question))?.id ?? "lookup";
  const top = hits[0];
  const confidence = top ? Math.min(1, top.score / Math.max(4, terms.length * 3)) : 0;
  const profile = kb.profile ?? {};

  if (intent === "contact") {
    const links = profile.links ?? {};
    return {
      text:
        `${profile.name ?? "He"} is ${profile.status ?? "open to work"}. The reliable ways to reach him: ` +
        `${links.email ? `email ${links.email}` : "email on the profile"}, ` +
        `${links.linkedin ? `LinkedIn (${links.linkedin})` : "LinkedIn"}, or open an issue on any repository.`,
      sources: Object.entries(links).filter(([, url]) => url).map(([label, url]) => ({ label, url })),
      confidence: 1,
    };
  }

  if (intent === "count" && terms.some((t) => /repo|project/i.test(t))) {
    const repos = (kb.entries ?? []).filter((e) => e.kind === "repo");
    return {
      text: `There are ${profile.counts?.repos ?? repos.length} public repositories, ${repos.length} of them described here. The featured ones are ${repos.slice(0, 4).map((r) => r.title).join(", ")}.`,
      sources: sourcesFrom(hits.length ? hits : repos.slice(0, 4).map((entry) => ({ entry, score: 0 }))),
      confidence: 1,
    };
  }

  if (intent === "latest") {
    const newest = [...(kb.entries ?? [])]
      .filter((e) => e.kind === "repo")
      .sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""))
      .slice(0, 3);
    return {
      text: `Most recently pushed: ${newest.map((r) => `${r.title} (${r.updated})`).join(", ")}.`,
      sources: newest.map((r) => ({ label: r.title, url: r.url })),
      confidence: 0.9,
    };
  }

  if (intent === "identity") {
    const bio = fact(kb, "bio");
    if (bio) {
      return {
        text: `${bio.summary}`,
        sources: bio.url ? [{ label: "GitHub profile", url: bio.url }] : [],
        confidence: 0.95,
      };
    }
  }

  // "which projects use TypeScript", "does he work with Python": answered from declared stack and
  // topics, which is a fact, rather than from prose that merely mentions the word.
  if (/\b(use|uses|using|work with|worked with|stack|technolog|language)\b/i.test(question)) {
    const known = (kb.entries ?? [])
      .flatMap((e) => [...(e.stack ?? []), ...(e.topics ?? [])])
      .map((value) => stem(String(value).toLowerCase()));
    const techTerms = terms.filter((t) => known.includes(t));
    const matches = techTerms.length ? byTechnology(kb, techTerms, 6) : [];
    if (matches.length) {
      const declared = matches
        .flatMap((m) => [...(m.stack ?? []), ...(m.topics ?? [])])
        .find((value) => techTerms.includes(stem(String(value).toLowerCase())));
      const label = declared ?? techTerms.join(", ");
      return {
        text: `${matches.length === 1 ? "One repository uses" : `${matches.length} repositories use`} ${label}: ${matches.map((m) => m.title).join(", ")}.`,
        sources: matches.slice(0, 4).map((m) => ({ label: m.title, url: m.url })),
        confidence: 0.85,
      };
    }
  }

  if (top && confidence >= 0.3) {
    const entry = top.entry;
    const parts = [];
    if (entry.summary) parts.push(entry.summary);
    const stack = (entry.stack ?? []).slice(0, 6);
    if (stack.length) parts.push(`Stack: ${stack.join(", ")}.`);
    if (entry.kind === "repo" && entry.updated) parts.push(`Last pushed ${entry.updated}.`);
    return { text: parts.join(" "), sources: sourcesFrom(hits.slice(0, 2)), confidence };
  }

  if (hits.length) {
    return {
      text: `Nothing certain matches that. Closest public work: ${hits.map((h) => h.entry.title).join(", ")}.`,
      sources: sourcesFrom(hits),
      confidence,
    };
  }

  return {
    text:
      "I do not have that. I only answer from his public repositories and profile, and I will not guess. " +
      "Try a project name, a technology (React, Python, RAG), or ask what he is working on.",
    sources: [],
    confidence: 0,
  };
}

export const SUGGESTIONS = [
  "What is ThreadMind?",
  "Which projects use TypeScript?",
  "What is he working on right now?",
  "How do I contact him?",
  "Does he work with LLM agents?",
];
