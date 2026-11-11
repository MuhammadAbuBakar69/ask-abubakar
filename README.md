# Ask about Abu-Bakar

A public page where anyone can ask about Muhammad Abu-Bakar and his repositories, and get an answer that
cites its source.

Live: https://muhammadabubakar69.github.io/ask-abubakar/

## What it is, precisely

A retrieval engine, not a language model. `lib/retrieval.mjs` scores every knowledge-base entry against
the question and composes an answer from the winning entry's own fields. `scripts/build-kb.mjs` rebuilds
that knowledge base from the GitHub API every day, so answers cannot drift from the code.

Why not an LLM: a public page cannot hold a provider key, a proxy costs money per visitor, and a model
would occasionally invent a project that does not exist. On a question about what someone has built, a
lookup is both cheaper and more truthful. The engine returns `insufficient` rather than guessing: ask it
about Rust firmware and it says it does not know.

## Guarantees

- Every answer shows the repository it came from.
- Unknown or unsupported questions refuse explicitly, with a low-confidence marker.
- Nothing is fetched from a third party at runtime. The page reads one local JSON file.

## Local development

```bash
npm run kb      # rebuild public/kb.json from the GitHub API (uses GITHUB_TOKEN if set)
npm test        # 9 tests over the retrieval engine, no network
npm run serve   # http://localhost:3000
```

## Adding a language model later

The honest place for one is a serverless function holding the key, and only to rephrase what retrieval
already found. Concretely: keep `answer()` as the source of truth, POST `{question, hits}` to the
function, and reject any response that introduces a repository name not present in `hits`. The UI does
not need to change.
