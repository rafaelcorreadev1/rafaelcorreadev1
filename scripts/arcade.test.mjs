import test from 'node:test';
import assert from 'node:assert/strict';
import { windowFor, calendarDays, fetchCalendar, renderCalendar } from './arcade.mjs';

function fixture(now, count = 0) {
  const { start, end } = windowFor(now);
  const contributionDays = [];
  for (let time = start; time <= end; time += 86_400_000) {
    contributionDays.push({ date: new Date(time).toISOString().slice(0, 10), contributionCount: count, contributionLevel: count ? 'FIRST_QUARTILE' : 'NONE' });
  }
  return { data: { user: { contributionsCollection: { contributionCalendar: { weeks: [{ contributionDays }] } } } } };
}

test('16 calendar columns stay aligned across year and leap-day boundaries', () => {
  for (const date of ['2026-01-01', '2024-03-01', '2026-09-20', '2026-09-26']) {
    const now = new Date(`${date}T12:00:00Z`);
    const days = calendarDays(fixture(now, 2), now);
    assert.equal(new Date(days[0].date).getUTCDay(), 0);
    assert.equal(days.at(-1).date, date);
    assert.equal(days.at(-1).column, 15);
    assert.equal(days.at(-1).row, now.getUTCDay());
    assert.ok(days.every((day) => day.row === new Date(day.date).getUTCDay()));
  }
});

test('zero activity remains honest and renders a valid idle patrol', () => {
  const now = new Date('2026-09-21T12:00:00Z');
  const days = calendarDays(fixture(now), now);
  for (const theme of ['dark', 'light']) {
    const svg = renderCalendar(days, theme);
    assert.match(svg, /0 contribuições · 0 dias ativos/);
    assert.match(svg, /prefers-reduced-motion:reduce/);
    assert.doesNotMatch(svg, /NaN|undefined|<script|foreignObject|https?:\/\/(?!www.w3.org)/);
    assert.equal((svg.match(/<title>2026-/g) || []).length, days.length);
  }
});

test('partial, duplicated, invalid and API error responses cannot replace artwork', () => {
  const now = new Date('2026-09-21T12:00:00Z');
  assert.throws(() => calendarDays({ errors: [{ message: 'denied' }] }, now));
  assert.throws(() => calendarDays({ data: { user: null } }, now));
  for (const mutate of [
    (days) => days.pop(),
    (days) => { days[1] = days[0]; },
    (days) => { days[0].contributionCount = -1; },
    (days) => { days[0].contributionLevel = 'INVALID'; },
  ]) {
    const payload = fixture(now);
    mutate(payload.data.user.contributionsCollection.contributionCalendar.weeks[0].contributionDays);
    assert.throws(() => calendarDays(payload, now));
  }
});

test('API failures fail closed; the query is scoped to the profile owner', async () => {
  const now = new Date('2026-09-21T12:00:00Z');
  await assert.rejects(fetchCalendar('', now));
  await assert.rejects(fetchCalendar('test-token', now, async () => ({ ok: false, status: 403 })));
  const result = await fetchCalendar('test-token', now, async (url, options) => {
    assert.equal(url, 'https://api.github.com/graphql');
    assert.equal(JSON.parse(options.body).variables.login, 'rafaelcorreadev1');
    return { ok: true, json: async () => fixture(now, 1) };
  });
  assert.equal(result.length, 107);
});
