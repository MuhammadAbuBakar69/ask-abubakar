/**
 * Builds the knowledge base the chat answers from. Runs in CI daily, so the answers cannot drift from
 * the repositories. Nothing is invented here: every field comes from the GitHub API, and a field that is
 * absent in the API stays absent rather than being filled with a guess.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const LOGIN = process.env.KB_LOGIN ?? "MuhammadAbuBakar69";
const TOKEN = process.env.GITHUB_TOKEN ?? process.env.GITHUB_ACCESS_TOKEN ?? "";
const OUT = new URL("../public/kb.json", import.meta.url);
const README_BUDGET = 14;

const api = async (path) => {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "ask-abubakar-kb",
      ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
};

const clean = (md) =>
  md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/[*_`>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const main = async () => {
  const user = await api(`/users/${LOGIN}`);
  const repos = (await api(`/users/${LOGIN}/repos?per_page=100&sort=pushed`))
    .filter((r) => !r.fork && !r.archived)
    .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at));

  const entries = [];
  const languages = {};
  for (const repo of repos) {
    if (repo.language) languages[repo.language] = (languages[repo.language] ?? 0) + 1;
  }

  // The profile name carries a double space on GitHub; collapse it before it reaches an answer.
  const displayName = (user.name ?? LOGIN).replace(/\s+/g, " ").trim();
  const bio =
    user.bio ??
    `${displayName} is a developer in ${user.location ?? "Pakistan"} with ${user.public_repos} public repositories.`;
  entries.push({
    id: "fact:bio",
    kind: "fact",
    title: displayName,
    summary: `${bio} Most used language: ${Object.entries(languages).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "n/a"}.`,
    topics: Object.keys(languages),
    stack: Object.keys(languages),
    body: "",
    url: user.html_url,
    updated: null,
  });

  for (const [i, repo] of repos.entries()) {
    let body = "";
    if (i < README_BUDGET) {
      try {
        const readme = await api(`/repos/${LOGIN}/${repo.name}/readme`);
        body = clean(Buffer.from(readme.content, "base64").toString("utf8")).slice(0, 1400);
      } catch {
        body = ""; // a repository without a README is a fact, not a failure
      }
    }
    entries.push({
      id: `repo:${repo.name}`,
      kind: "repo",
      title: repo.name,
      summary: repo.description ?? "",
      topics: repo.topics ?? [],
      stack: [repo.language, ...(repo.topics ?? [])].filter(Boolean),
      body,
      url: repo.html_url,
      demo: repo.homepage || null,
      stars: repo.stargazers_count,
      updated: repo.pushed_at.slice(0, 10),
    });
  }

  const kb = {
    generated_at: new Date().toISOString().slice(0, 10),
    profile: {
      login: user.login,
      name: displayName,
      location: user.location,
      status: "open to work",
      counts: { repos: user.public_repos, described: repos.length },
      languages: Object.entries(languages).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
      links: {
        github: user.blog ? user.html_url : user.html_url,
        portfolio: "https://withabubakar.netlify.app",
        linkedin: "https://www.linkedin.com/in/mohamad-abubakar/",
        email: "md.bakar2006@gmail.com",
      },
    },
    entries,
  };

  await mkdir(dirname(OUT.pathname), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(kb, null, 2)}\n`);
  console.log(`kb: ${entries.length} entries from ${repos.length} repositories -> public/kb.json`);
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
