import { test } from "node:test";
import assert from "node:assert/strict";
import { answer, search, tokenize } from "../public/lib/retrieval.mjs";

const kb = {
  profile: {
    name: "Muhammad Abu-Bakar",
    status: "open to work",
    counts: { repos: 70, described: 4 },
    links: {
      github: "https://github.com/MuhammadAbuBakar69",
      linkedin: "https://www.linkedin.com/in/mohamad-abubakar/",
      email: "md.bakar2006@gmail.com",
    },
  },
  entries: [
    {
      id: "fact:bio",
      kind: "fact",
      title: "Muhammad Abu-Bakar",
      summary: "Full-stack developer in Karachi building AI products.",
      topics: [],
      stack: [],
      body: "",
      url: "https://github.com/MuhammadAbuBakar69",
    },
    {
      id: "repo:threadmind-ai",
      kind: "repo",
      title: "threadmind-ai",
      summary: "Textile factory intelligence: five agents, event-driven, tenant isolated.",
      topics: ["agents", "rag", "python"],
      stack: ["Python", "FastAPI", "Next.js"],
      body: "An industrial AI platform for a textile factory with predictive maintenance and OEE metrics.",
      url: "https://github.com/MuhammadAbuBakar69/threadmind-ai",
      updated: "2026-11-11",
    },
    {
      id: "repo:growthpilot-ai",
      kind: "repo",
      title: "growthpilot-ai",
      summary: "Business growth analysis with a scored diagnosis and a 30/60/90 roadmap.",
      topics: ["typescript", "nextjs", "seo"],
      stack: ["TypeScript", "Next.js"],
      body: "Local-first growth analysis: 19 page checks, evidence-classed recommendations.",
      url: "https://github.com/MuhammadAbuBakar69/growthpilot-ai",
      updated: "2026-11-11",
    },
  ],
};

test("tokenizer drops stopwords and keeps product names", () => {
  assert.deepEqual(tokenize("What is the ThreadMind?"), ["threadmind"]);
  assert.deepEqual(tokenize("which projects use TypeScript"), ["project", "use", "typescript"]);
});

test("a project name ranks its own entry first", () => {
  const hits = search(kb, "what is threadmind");
  assert.equal(hits[0].entry.title, "threadmind-ai");
});

test("a technology question finds the repositories that use it", () => {
  const hits = search(kb, "which projects use typescript");
  assert.equal(hits[0].entry.title, "growthpilot-ai");
});

test("a technology question lists repositories by declared stack, not by prose mention", () => {
  const result = answer(kb, "which projects use Python?");
  assert.match(result.text, /threadmind-ai/);
  assert.ok(!/Business growth analysis/.test(result.text));
});

test("a technology named only in the profile still answers above the refusal threshold", () => {
  const withRag = { ...kb };
  withRag.entries = kb.entries.map((e) =>
    e.id === "fact:bio" ? { ...e, summary: `${e.summary} Works with RAG and LLM agents.` } : e,
  );
  const result = answer(withRag, "does he work with rag?");
  assert.match(result.text, /RAG/i);
  assert.ok(result.confidence >= 0.3);
});

test("answers cite the repository they came from", () => {
  const result = answer(kb, "what is threadmind");
  assert.match(result.text, /Textile|industrial|agents/i);
  assert.equal(result.sources[0].url, "https://github.com/MuhammadAbuBakar69/threadmind-ai");
  assert.ok(result.confidence > 0.3);
});

test("contact questions return the real links, not a generated guess", () => {
  const result = answer(kb, "how do I contact him?");
  assert.match(result.text, /md\.bakar2006@gmail\.com/);
  assert.ok(result.sources.some((s) => s.url.includes("linkedin")));
});

test("count questions answer from the profile counts", () => {
  const result = answer(kb, "how many repos does he have?");
  assert.match(result.text, /70 public repositories/);
});

test("the latest question sorts by push date", () => {
  const result = answer(kb, "what is he working on right now?");
  assert.match(result.text, /growthpilot-ai|threadmind-ai/);
});

test("an unknown topic returns an explicit refusal, not an invented project", () => {
  const result = answer(kb, "does he write Rust firmware for satellites?");
  assert.match(result.text, /do not have that|Nothing certain/i);
  assert.equal(result.confidence < 0.5, true);
});

test("a bio question is answered from the profile fact", () => {
  const result = answer(kb, "who is Abu-Bakar?");
  assert.match(result.text, /Full-stack developer/);
});
