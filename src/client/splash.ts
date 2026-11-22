// Aguamesa start page (inline feed entrypoint): dark Apple-style header, the
// Night / Location / Streak rows, Start, footer.
//
// Data comes from the same GET /api/init endpoint the game boots from
// ({ player, today }). Under `npm run dev:local` there is no server, so like
// the game (which uses mockApi there) the splash uses mockApi too. When the
// endpoint cannot be reached, context.postData ({ dayId, night }, pinned when
// the post was created) still gives the night number and the date: the streak
// then shows the 0 state and the Location row stays hidden instead of showing
// an invented place.
//
// Button: Start opens the 'game' entrypoint via requestExpandedMode.
import { context, requestExpandedMode } from '@devvit/web/client';
import type { LocationId } from '../shared/types';
import { mockApi } from './mockApi';

type SplashData = {
  night: number;
  dayId: string;
  location: LocationId;
  streak: number;
};

const LOCATION_NAMES: Record<LocationId, string> = {
  cafe: 'Midnight Café',
  beach: 'Beach Bar',
  chalet: 'Mountain Chalet',
  fair: 'Funfair',
  pirate: 'Pirate Ship',
  castle: 'Haunted Castle',
};

const DAY_ID_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function element(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`splash: missing #${id}`);
  return node;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asLocationId(value: unknown): LocationId | null {
  return value === 'cafe' ||
    value === 'beach' ||
    value === 'chalet' ||
    value === 'fair' ||
    value === 'pirate' ||
    value === 'castle'
    ? value
    : null;
}

/** "2026-11-24" -> "Tue, 24 Nov" (midday UTC so the date never shifts a day). */
function formatDay(dayId: string | null): string | null {
  if (dayId === null || !DAY_ID_PATTERN.test(dayId)) return null;
  const date = new Date(`${dayId}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date);
}

function todayLabel(): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date());
}

function isLocalHost(): boolean {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

function toSplashData(value: unknown): SplashData | null {
  if (!isRecord(value)) return null;
  const player = value['player'];
  const today = value['today'];
  if (!isRecord(player) || !isRecord(today)) return null;
  const night = asNumber(today['night']);
  const dayId = asString(today['dayId']);
  const location = asLocationId(today['location']);
  const streak = asNumber(player['streak']);
  if (night === null || dayId === null || location === null || streak === null) return null;
  return { night, dayId, location, streak };
}

async function loadInit(): Promise<SplashData | null> {
  if (isLocalHost()) return toSplashData(await mockApi.init());
  try {
    const res = await fetch('/api/init');
    if (!res.ok) return null;
    return toSplashData(await res.json());
  } catch {
    return null;
  }
}

function render(init: SplashData | null): void {
  const nightValue = element('night-value');
  const locationRow = element('location-row');
  const locationValue = element('location-value');
  const streakValue = element('streak-value');
  const streakHint = element('streak-hint');

  const pin: Record<string, unknown> = context.postData ?? {};
  const night = init?.night ?? asNumber(pin['night']);
  const dayId = init?.dayId ?? asString(pin['dayId']);
  const location = init?.location ?? null;
  const streak = init?.streak ?? 0;

  const date = formatDay(dayId) ?? todayLabel();
  nightValue.textContent = night === null ? date : `${night} · ${date}`;

  if (location === null) {
    locationRow.hidden = true;
  } else {
    locationRow.hidden = false;
    locationValue.textContent = LOCATION_NAMES[location];
  }

  streakValue.textContent = String(streak);
  streakHint.hidden = streak !== 0;
}

function expandToGame(event: MouseEvent): void {
  requestExpandedMode(event, 'game');
}

element('play-button').addEventListener('click', expandToGame);

loadInit()
  .then(render)
  .catch(() => render(null));
