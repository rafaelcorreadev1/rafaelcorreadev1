import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const OWNER = 'rafaelcorreadev1';
const DAY = 86_400_000;
const LEVELS = ['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE'];
const THEMES = {
  dark: { bg: '#0d1117', panel: '#1b1628', border: '#3a3150', ink: '#f2eefa', muted: '#b4a9cc', accent: '#c4a1ff', bot: '#ffc978', cells: ['#2a2438', '#3e2a66', '#5c3a9e', '#8659dd', '#c4a1ff'] },
  light: { bg: '#faf8fd', panel: '#f0ebf8', border: '#d8cde9', ink: '#2a1f3d', muted: '#64597b', accent: '#6d28d9', bot: '#965500', cells: ['#e7e1f1', '#cfbaf2', '#a886e6', '#8150d8', '#5b21b6'] },
};
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

export function windowFor(now = new Date()) {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const start = end - (now.getUTCDay() + 15 * 7) * DAY;
  return { start, end };
}

export function calendarDays(payload, now = new Date()) {
  if (payload.errors?.length) throw new Error('GitHub GraphQL returned errors; preserving existing artwork.');
  const weeks = payload.data?.user?.contributionsCollection?.contributionCalendar?.weeks;
  if (!Array.isArray(weeks)) throw new Error('Missing GitHub contribution calendar.');
  const { start, end } = windowFor(now);
  const days = weeks.flatMap((week) => week.contributionDays).filter((day) => {
    const time = Date.parse(day?.date);
    return time >= start && time <= end;
  }).sort((a, b) => a.date.localeCompare(b.date));
  const expected = (end - start) / DAY + 1;
  if (days.length !== expected) throw new Error('Incomplete contribution calendar.');
  return days.map((day, i) => {
    if (day.date !== iso(start + i * DAY) || !Number.isInteger(day.contributionCount)
      || day.contributionCount < 0 || !LEVELS.includes(day.contributionLevel)) {
      throw new Error('Invalid contribution day.');
    }
    return { date: day.date, count: day.contributionCount, level: LEVELS.indexOf(day.contributionLevel), column: Math.floor(i / 7), row: i % 7 };
  });
}

export async function fetchCalendar(token, now = new Date(), request = fetch) {
  if (!token) throw new Error('GH_TOKEN is required; use the built-in GITHUB_TOKEN in Actions.');
  const { start, end } = windowFor(now);
  const response = await request('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'rafaelcorreadev1-profile' },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      query: `query($login: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $login) { contributionsCollection(from: $from, to: $to) {
          contributionCalendar { weeks { contributionDays { date contributionCount contributionLevel } } }
        } }
      }`,
      variables: { login: OWNER, from: new Date(start).toISOString(), to: new Date(Math.min(now.getTime(), end + DAY - 1)).toISOString() },
    }),
  });
  if (!response.ok) throw new Error(`GitHub API failed (${response.status}); preserving existing artwork.`);
  return calendarDays(await response.json(), now);
}

function robot(color, eye) {
  return `<g shape-rendering="crispEdges" fill="${color}"><path d="M-1-11h2v3h-2z M-7-7h14v11h-14z M-10-3h3v5h-3z M7-3h3v5h-3z M-5 4h3v4h-3z M2 4h3v4h-3z"/><path fill="${eye}" d="M-4-4h2v3h-2z M2-4h2v3h-2z M-2 1h4v1h-4z"/></g>`;
}

function svg(theme, height, title, body, style = '') {
  const p = THEMES[theme];
  if (!p) throw new Error('Unknown theme.');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 ${height}" role="img" aria-labelledby="title desc">
<title id="title">${title}</title>
<desc id="desc">Terminal de desenvolvedor do Rafael Correa. Pixel art original, sem JavaScript nem recursos externos.</desc>
<style>text{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;fill:${p.ink}}.muted{fill:${p.muted}}.accent{fill:${p.accent}}${style}@media(prefers-reduced-motion:reduce){.bot{animation:none!important}}</style>
<rect x="1" y="1" width="558" height="${height - 2}" rx="14" fill="${p.bg}" stroke="${p.border}"/>
${body}
</svg>\n`;
}

export function renderTerminal(theme) {
  const p = THEMES[theme];
  return svg(theme, 192, 'Rafael Correa — Desenvolvedor Full Stack', `
<path d="M1 42h558" stroke="${p.border}"/>
<circle cx="25" cy="23" r="4" fill="${p.accent}"/><circle cx="40" cy="23" r="4" fill="${p.muted}"/><circle cx="55" cy="23" r="4" fill="${p.border}"/>
<text x="77" y="28" font-size="13" class="muted">rafael@dev: ~</text>
<text x="28" y="78" font-size="16" class="accent">&gt; whoami</text>
<text x="28" y="116" font-size="34" font-weight="700">Rafael Correa</text>
<text x="28" y="144" font-size="18">Desenvolvedor Full Stack · IA</text>
<text x="28" y="172" font-size="14" class="muted">Do processo manual ao produto com IA.</text>
<g transform="translate(491 108) scale(3)">${robot(p.accent, p.bg)}</g>`);
}

export function renderCalendar(days, theme) {
  const p = THEMES[theme];
  if (!days.length) throw new Error('Cannot render an empty calendar.');
  const total = days.reduce((sum, d) => sum + d.count, 0);
  const active = days.filter((d) => d.count > 0).length;
  const route = [...days].sort((a, b) => a.column - b.column || (a.column % 2 ? b.row - a.row : a.row - b.row));
  const position = (d) => `${52 + d.column * 30}px,${118 + d.row * 26}px`;
  const frames = route.map((d, i) => `${(i / (route.length - 1) * 100).toFixed(3)}%{transform:translate(${position(d)})}`).join('');
  const cells = days.map((d) => `<rect x="${40 + d.column * 30}" y="${106 + d.row * 26}" width="24" height="22" rx="3" fill="${p.cells[d.level]}"><title>${d.date}: ${d.count} contribuições</title></rect>`).join('\n');
  const labels = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => `<text x="17" y="${122 + i * 26}" font-size="12" class="muted">${d}</text>`).join('');
  return svg(theme, 354, `Patrulha do Byte — ${total} contribuições em ${active} dias ativos`, `
<rect x="14" y="14" width="532" height="42" rx="7" fill="${p.panel}"/>
<text x="28" y="41" font-size="18" font-weight="700" class="accent">BYTE / PATRULHA DE CONTRIBUIÇÕES</text>
<text x="28" y="82" font-size="16">${total} contribuições · ${active} dias ativos</text>
${labels}${cells}
<g class="bot" style="transform:translate(${position(route[0])})">${robot(p.bot, p.bg)}</g>
<text x="28" y="310" font-size="13" class="muted">${days[0].date} — ${days.at(-1).date}</text>
<text x="28" y="335" font-size="13" class="muted">16 SEMANAS / AUTO-SAVE DIÁRIO</text>
<text x="348" y="335" font-size="12" class="muted">MENOS</text>
${p.cells.map((color, i) => `<rect x="393" y="${324}" width="12" height="12" rx="2" fill="${color}" transform="translate(${i * 17})"/>`).join('')}
<text x="483" y="335" font-size="12" class="muted">MAIS</text>`, `@keyframes patrol{${frames}}.bot{animation:patrol ${route.length * 0.8}s linear infinite}`);
}

export async function generate(token = process.env.GH_TOKEN) {
  const days = await fetchCalendar(token);
  // Validate and render everything before touching the last good output.
  const files = Object.keys(THEMES).flatMap((theme) => [
    [`contributions-${theme}.svg`, renderCalendar(days, theme)],
    [`terminal-${theme}.svg`, renderTerminal(theme)],
  ]);
  const directory = new URL('../assets/', import.meta.url);
  await mkdir(directory, { recursive: true });
  for (const [name, content] of files) await writeFile(new URL(name, directory), content);
  console.log(`Rendered ${days.length} real contribution days in both themes.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generate().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
