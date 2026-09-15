import type { RecentEntry, RecentKind, Theme } from "./types";

const THEME_KEY = "code-notepad.theme";
const RECENTS_KEY = "code-notepad.recents";
const RECENTS_LIMIT = 12;
const AUTOSAVE_KEY = "code-notepad.autosave";
const LAST_SESSION_KEY = "code-notepad.last-session";
const BUFFERS_KEY = "code-notepad.buffers";
const MAX_BUFFER_CHARS = 400_000;
const MAX_BUFFER_ENTRIES = 30;

export interface SessionSnapshotData {
  workspace: string | null;
  paths: string[];
  activePath: string | null;
}

export interface BufferEntry {
  path: string | null;
  name: string;
  language: string;
  contents: string;
  modifiedAt: number;
}

function persist(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Stockage indisponible ou saturé (quota, plan Entreprise) : la session
    // continue sans persistance plutôt que d'interrompre l'action en cours.
  }
}

export function readTheme(): Theme {
  return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
}

export function saveTheme(theme: Theme): void {
  persist(THEME_KEY, theme);
}

export function readAutosaveEnabled(): boolean {
  return localStorage.getItem(AUTOSAVE_KEY) === "1";
}

export function saveAutosaveEnabled(enabled: boolean): void {
  persist(AUTOSAVE_KEY, enabled ? "1" : "0");
}

export function rememberLastSession(snapshot: SessionSnapshotData): void {
  persist(LAST_SESSION_KEY, JSON.stringify(snapshot));
}

export function readLastSession(): SessionSnapshotData | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(LAST_SESSION_KEY) ?? "null");
    if (!value || typeof value !== "object") return null;
    const candidate = value as Partial<SessionSnapshotData>;
    if (!Array.isArray(candidate.paths)) return null;
    return {
      workspace: typeof candidate.workspace === "string" ? candidate.workspace : null,
      paths: candidate.paths.filter((path): path is string => typeof path === "string"),
      activePath: typeof candidate.activePath === "string" ? candidate.activePath : null,
    };
  } catch {
    return null;
  }
}

export function saveBuffer(key: string, entry: BufferEntry): void {
  if (entry.contents.length > MAX_BUFFER_CHARS) return;
  try {
    const buffers = readBuffers();
    buffers[key] = entry;
    const ordered = Object.entries(buffers)
      .sort((left, right) => right[1].modifiedAt - left[1].modifiedAt)
      .slice(0, MAX_BUFFER_ENTRIES);
    persist(BUFFERS_KEY, JSON.stringify(Object.fromEntries(ordered)));
  } catch {
    // Tampons indisponibles : la récupération après crash le sera aussi.
  }
}

export function clearBuffer(key: string): void {
  try {
    const buffers = readBuffers();
    if (!(key in buffers)) return;
    delete buffers[key];
    persist(BUFFERS_KEY, JSON.stringify(buffers));
  } catch {
    // Clé restera en place ; la récupération vérifie le contenu.
  }
}

export function readBuffers(): Record<string, BufferEntry> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(BUFFERS_KEY) ?? "{}");
    if (!value || typeof value !== "object") return {};
    const buffers: Record<string, BufferEntry> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (!entry || typeof entry !== "object") continue;
      const candidate = entry as Partial<BufferEntry>;
      if (
        (candidate.path === null || typeof candidate.path === "string") &&
        typeof candidate.name === "string" &&
        typeof candidate.language === "string" &&
        typeof candidate.contents === "string" &&
        typeof candidate.modifiedAt === "number"
      ) {
        buffers[key] = candidate as BufferEntry;
      }
    }
    return buffers;
  } catch {
    return {};
  }
}

export function readRecents(): RecentEntry[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value
      .filter((entry): entry is RecentEntry => {
        if (!entry || typeof entry !== "object") return false;
        const candidate = entry as Partial<RecentEntry>;
        return (
          (candidate.kind === "file" || candidate.kind === "folder") &&
          typeof candidate.name === "string" &&
          typeof candidate.path === "string" &&
          typeof candidate.lastOpened === "number"
        );
      })
      .slice(0, RECENTS_LIMIT);
  } catch {
    return [];
  }
}

export function rememberRecent(kind: RecentKind, path: string, name: string): RecentEntry[] {
  const next: RecentEntry[] = [
    { kind, path, name, lastOpened: Date.now() },
    ...readRecents().filter((entry) => entry.path.toLocaleLowerCase() !== path.toLocaleLowerCase()),
  ].slice(0, RECENTS_LIMIT);
  persist(RECENTS_KEY, JSON.stringify(next));
  return next;
}

export function removeRecent(path: string): RecentEntry[] {
  const next = readRecents().filter(
    (entry) => entry.path.toLocaleLowerCase() !== path.toLocaleLowerCase(),
  );
  persist(RECENTS_KEY, JSON.stringify(next));
  return next;
}

