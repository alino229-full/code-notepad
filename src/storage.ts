import type { RecentEntry, RecentKind, Theme } from "./types";

const THEME_KEY = "code-notepad.theme";
const RECENTS_KEY = "code-notepad.recents";
const RECENTS_LIMIT = 12;

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

