import { answer, SUGGESTIONS } from "./lib/retrieval.mjs";

const $ = (id) => document.getElementById(id);
const transcript = $("transcript");
const form = $("ask");
const input = $("q");
const note = $("note");

let kb = null;

function turn(kind, text) {
  const wrap = document.createElement("div");
  wrap.className = `turn ${kind}`;
  const say = document.createElement("p");
  say.className = "say";
  say.textContent = text;
  wrap.append(say);
  transcript.append(wrap);
  transcript.scrollTop = transcript.scrollHeight;
  return wrap;
}

function renderAnswer(result) {
  const wrap = turn("answer", result.text);
  const meta = document.createElement("p");
  meta.className = "meta";

  for (const source of result.sources.slice(0, 3)) {
    const link = document.createElement("a");
    link.href = source.url;
    link.textContent = source.label;
    link.rel = "noopener noreferrer";
    link.target = "_blank";
    meta.append(link);
  }

  const tag = document.createElement("span");
  const weak = result.confidence < 0.3;
  tag.className = `tag${weak ? " low" : ""}`;
  tag.textContent = weak ? "low confidence" : `match ${Math.round(result.confidence * 100)}%`;
  meta.append(tag);

  wrap.append(meta);
  transcript.scrollTop = transcript.scrollHeight;
}

function ask(question) {
  const q = question.trim();
  if (!q) return;
  input.value = "";
  turn("user", q);

  if (!kb) {
    turn("assistant", "The knowledge base has not loaded, so I cannot answer from sources. Reload the page.");
    return;
  }
  try {
    renderAnswer(answer(kb, q));
  } catch (error) {
    turn("assistant", "Something failed while reading the knowledge base. Reload and try again.");
    note.textContent = `error: ${error.message}`;
  }
}

async function boot() {
  const res = await fetch("./kb.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`kb.json ${res.status}`);
  kb = await res.json();
  $("repo-count").textContent = `${kb.profile?.counts?.repos ?? "public"} public repos`;
  note.textContent = `knowledge base ${kb.generated_at} · ${kb.entries.length} entries · ${kb.profile?.counts?.described ?? 0} repositories described`;

  for (const suggestion of SUGGESTIONS) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = suggestion;
    chip.addEventListener("click", () => ask(suggestion));
    $("chips").append(chip);
  }
  input.focus({ preventScroll: true });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  ask(input.value);
});

boot().catch((error) => {
  note.textContent = `knowledge base unavailable (${error.message}). Run npm run kb, then reload.`;
});
