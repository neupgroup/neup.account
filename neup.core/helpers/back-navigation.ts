'use client';

const BACK_HISTORY_STORAGE_KEY = 'neup:back-history';
const MAX_HISTORY_ENTRIES = 50;

function readHistory(): string[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.sessionStorage.getItem(BACK_HISTORY_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((entry): entry is string => typeof entry === 'string');
  } catch {
    return [];
  }
}

function writeHistory(history: string[]) {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(BACK_HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Ignore storage write failures.
  }
}

export function recordCurrentInAppPath(path?: string) {
  if (typeof window === 'undefined') return;

  const nextPath = path ?? `${window.location.pathname}${window.location.search}`;
  if (!nextPath) return;

  const history = readHistory();
  if (history[history.length - 1] === nextPath) return;

  const updated = [...history, nextPath].slice(-MAX_HISTORY_ENTRIES);
  writeHistory(updated);
}

export function hasPreviousInAppPath(): boolean {
  return readHistory().length > 1;
}

