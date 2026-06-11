/**
 * Generatore della profile card custom.
 *
 * Zero dipendenze: GraphQL API di GitHub via fetch nativo, SVG disegnato
 * a mano con template string. Eseguibile direttamente con Node >= 23.6
 * (type stripping nativo): `GITHUB_TOKEN=... node scripts/generate-card.ts`
 */

import { writeFileSync } from "node:fs";

const LOGIN = process.env.GH_LOGIN ?? "AndreaMolinari";
const TOKEN = process.env.GITHUB_TOKEN ?? process.env.METRICS_TOKEN;
const OUTPUT = process.env.OUTPUT ?? "profile-card.svg";

if (!TOKEN) {
  console.error("Manca GITHUB_TOKEN (o METRICS_TOKEN) nell'ambiente.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Dati
// ---------------------------------------------------------------------------

interface LanguageEdge {
  size: number;
  node: { name: string; color: string | null };
}

interface ApiData {
  user: {
    name: string | null;
    login: string;
    followers: { totalCount: number };
    repositories: {
      totalCount: number;
      nodes: Array<{
        stargazerCount: number;
        languages: { edges: LanguageEdge[] };
      }>;
    };
    contributionsCollection: {
      totalCommitContributions: number;
      totalPullRequestContributions: number;
      totalIssueContributions: number;
      contributionCalendar: {
        totalContributions: number;
        weeks: Array<{
          contributionDays: Array<{ date: string; contributionCount: number }>;
        }>;
      };
    };
  };
}

const QUERY = `
  query ($login: String!) {
    user(login: $login) {
      name
      login
      followers { totalCount }
      repositories(first: 100, ownerAffiliations: OWNER, isFork: false) {
        totalCount
        nodes {
          stargazerCount
          languages(first: 8, orderBy: { field: SIZE, direction: DESC }) {
            edges { size node { name color } }
          }
        }
      }
      contributionsCollection {
        totalCommitContributions
        totalPullRequestContributions
        totalIssueContributions
        contributionCalendar {
          totalContributions
          weeks { contributionDays { date contributionCount } }
        }
      }
    }
  }
`;

async function fetchData(): Promise<ApiData> {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } }),
  });
  if (!res.ok) throw new Error(`GitHub API: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { data?: ApiData; errors?: unknown[] };
  if (json.errors?.length || !json.data) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const fmt = (n: number): string =>
  n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n);

// ---------------------------------------------------------------------------
// Tema
// ---------------------------------------------------------------------------

const theme = {
  bgFrom: "#0d1117",
  bgTo: "#10141c",
  border: "#272e39",
  text: "#e6edf3",
  muted: "#8b949e",
  faint: "#484f58",
  accentFrom: "#7c3aed",
  accentTo: "#22d3ee",
  cellEmpty: "#1b212b",
  // scala del heatmap, dal più tenue al più acceso
  cells: ["#2b2459", "#4730a3", "#6d3ee0", "#9f7bff", "#c9b3ff"],
};

// ---------------------------------------------------------------------------
// Sezioni SVG
// ---------------------------------------------------------------------------

const W = 880;
const PAD = 40;
const INNER = W - PAD * 2;

function statsRow(y: number, stats: Array<{ label: string; value: string }>): string {
  const step = INNER / stats.length;
  return stats
    .map((s, i) => {
      const x = PAD + step * i;
      return `
    <g class="rise" style="animation-delay:${120 + i * 90}ms">
      <text x="${x}" y="${y}" class="stat-value">${esc(s.value)}</text>
      <text x="${x}" y="${y + 22}" class="stat-label">${esc(s.label)}</text>
    </g>`;
    })
    .join("");
}

function languagesBar(
  y: number,
  langs: Array<{ name: string; color: string; pct: number }>,
): string {
  const barH = 12;
  let x = PAD;
  const segments = langs
    .map((l) => {
      const w = (l.pct / 100) * INNER;
      const seg = `<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${barH}" fill="${l.color}"/>`;
      x += w;
      return seg;
    })
    .join("");

  const legend = langs
    .map((l, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const lx = PAD + col * (INNER / 3);
      const ly = y + 36 + row * 24;
      return `
    <g class="rise" style="animation-delay:${400 + i * 60}ms">
      <circle cx="${lx + 5}" cy="${ly - 4}" r="5" fill="${l.color}"/>
      <text x="${lx + 18}" y="${ly}" class="legend">${esc(l.name)} <tspan class="legend-pct">${l.pct.toFixed(1)}%</tspan></text>
    </g>`;
    })
    .join("");

  return `
    <clipPath id="bar-clip"><rect x="${PAD}" y="${y}" width="${INNER}" height="${barH}" rx="${barH / 2}"/></clipPath>
    <g clip-path="url(#bar-clip)" class="grow">${segments}</g>
    ${legend}`;
}

function heatmap(
  y: number,
  weeks: ApiData["user"]["contributionsCollection"]["contributionCalendar"]["weeks"],
): string {
  const pitch = Math.floor(INNER / weeks.length);
  const cell = pitch - 3;
  const max = Math.max(
    1,
    ...weeks.flatMap((w) => w.contributionDays.map((d) => d.contributionCount)),
  );

  const cells: string[] = [];
  const monthLabels: string[] = [];
  let lastMonth = -1;

  weeks.forEach((week, wi) => {
    const x = PAD + wi * pitch;
    week.contributionDays.forEach((day, di) => {
      const date = new Date(day.date);
      if (di === 0 && date.getMonth() !== lastMonth && wi < weeks.length - 2) {
        lastMonth = date.getMonth();
        const label = date.toLocaleString("en", { month: "short" });
        monthLabels.push(`<text x="${x}" y="${y - 8}" class="month">${label}</text>`);
      }
      const c = day.contributionCount;
      const fill =
        c === 0
          ? theme.cellEmpty
          : theme.cells[Math.min(theme.cells.length - 1, Math.floor((c / max) * theme.cells.length))];
      cells.push(
        `<rect class="cell" style="animation-delay:${wi * 9}ms" x="${x}" y="${y + di * pitch}" width="${cell}" height="${cell}" rx="2.5" fill="${fill}"/>`,
      );
    });
  });

  return monthLabels.join("") + cells.join("");
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render(data: ApiData): string {
  const u = data.user;
  const cc = u.contributionsCollection;

  const stars = u.repositories.nodes.reduce((s, r) => s + r.stargazerCount, 0);

  // linguaggi aggregati per byte su tutti i repo
  const langBytes = new Map<string, { size: number; color: string }>();
  for (const repo of u.repositories.nodes) {
    for (const { size, node } of repo.languages.edges) {
      const prev = langBytes.get(node.name);
      langBytes.set(node.name, {
        size: (prev?.size ?? 0) + size,
        color: node.color ?? theme.faint,
      });
    }
  }
  const totalBytes = [...langBytes.values()].reduce((s, l) => s + l.size, 0) || 1;
  const langs = [...langBytes.entries()]
    .map(([name, { size, color }]) => ({ name, color, pct: (size / totalBytes) * 100 }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 6);

  const weeks = cc.contributionCalendar.weeks;
  const pitch = Math.floor(INNER / weeks.length);

  const HEADER_Y = 64;
  const STATS_Y = 148;
  const LANGS_Y = 232;
  const legendRows = Math.ceil(langs.length / 3);
  const HEAT_TITLE_Y = LANGS_Y + 36 + legendRows * 24 + 36;
  const HEAT_Y = HEAT_TITLE_Y + 30;
  const H = HEAT_Y + 7 * pitch + PAD - 6;

  const updated = new Date().toISOString().slice(0, 10);

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="GitHub profile card of ${esc(u.login)}">
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Ubuntu, sans-serif; }
    .name { font-size: 26px; font-weight: 700; fill: ${theme.text}; }
    .tagline { font-size: 14px; fill: ${theme.muted}; }
    .total { font-size: 14px; font-weight: 600; fill: url(#accent); }
    .section { font-size: 13px; font-weight: 600; fill: ${theme.muted}; letter-spacing: 1.5px; }
    .stat-value { font-size: 24px; font-weight: 700; fill: ${theme.text}; }
    .stat-label { font-size: 12px; fill: ${theme.muted}; letter-spacing: 0.5px; }
    .legend { font-size: 13px; fill: ${theme.text}; }
    .legend-pct { fill: ${theme.muted}; }
    .month { font-size: 10px; fill: ${theme.faint}; }
    .footer { font-size: 11px; fill: ${theme.faint}; }
${
    process.env.NO_ANIM
      ? ""
      : `    .rise { animation: rise 0.5s ease-out both; }
    .cell { animation: pop 0.45s ease-out both; }
    .grow { transform-origin: ${PAD}px 0; animation: grow 0.8s 0.3s cubic-bezier(0.22, 1, 0.36, 1) both; }`
  }
    @keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
    @keyframes pop { from { opacity: 0; } to { opacity: 1; } }
    @keyframes grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  </style>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${theme.bgFrom}"/>
      <stop offset="100%" stop-color="${theme.bgTo}"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${theme.accentFrom}"/>
      <stop offset="100%" stop-color="${theme.accentTo}"/>
    </linearGradient>
  </defs>

  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="16" fill="url(#bg)" stroke="${theme.border}"/>
  <rect x="0.5" y="0.5" width="${W - 1}" height="3" rx="1.5" fill="url(#accent)"/>

  <g class="rise">
    <text x="${PAD}" y="${HEADER_Y}" class="name">${esc(u.name ?? u.login)}</text>
    <text x="${PAD}" y="${HEADER_Y + 24}" class="tagline">@${esc(u.login)} · GitHub activity, last 12 months</text>
    <text x="${W - PAD}" y="${HEADER_Y}" text-anchor="end" class="total">${fmt(cc.contributionCalendar.totalContributions)} contributions</text>
  </g>

  ${statsRow(STATS_Y, [
    { value: fmt(stars), label: "STARS" },
    { value: fmt(cc.totalCommitContributions), label: "COMMITS" },
    { value: fmt(cc.totalPullRequestContributions), label: "PULL REQUESTS" },
    { value: fmt(cc.totalIssueContributions), label: "ISSUES" },
    { value: fmt(u.followers.totalCount), label: "FOLLOWERS" },
    { value: fmt(u.repositories.totalCount), label: "REPOSITORIES" },
  ])}

  <text x="${PAD}" y="${LANGS_Y - 16}" class="section">TOP LANGUAGES</text>
  ${languagesBar(LANGS_Y, langs)}

  <text x="${PAD}" y="${HEAT_TITLE_Y}" class="section">CONTRIBUTIONS</text>
  ${heatmap(HEAT_Y, weeks)}

  <text x="${W - PAD}" y="${H - 18}" text-anchor="end" class="footer">updated ${updated}</text>
</svg>
`;
}

const data = await fetchData();
const svg = render(data);
writeFileSync(OUTPUT, svg);
console.log(`✓ ${OUTPUT} generato (${(svg.length / 1024).toFixed(1)} kB)`);
