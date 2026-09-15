import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RecentEntry } from "./types";
import {
  readAutosaveEnabled,
  readBuffers,
  readLastSession,
  readRecents,
  rememberLastSession,
  rememberRecent,
  removeRecent,
  saveAutosaveEnabled,
  saveBuffer,
  clearBuffer,
} from "./storage";

// Simulateur minimal de localStorage : l'API réelle n'existe pas sous Node.
const backing = new Map<string, string>();
const localStorageStub = {
  getItem: (key: string): string | null => backing.get(key) ?? null,
  setItem: (key: string, value: string): void => void backing.set(key, value),
  removeItem: (key: string): void => void backing.delete(key),
};

beforeEach(() => {
  backing.clear();
  vi.stubGlobal("localStorage", localStorageStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readRecents / rememberRecent / removeRecent", () => {
  it("retourne une liste vide quand le stockage est vide ou corrompu", () => {
    expect(readRecents()).toEqual([]);
    backing.set("code-notepad.recents", "{pas du json");
    expect(readRecents()).toEqual([]);
    backing.set("code-notepad.recents", JSON.stringify([{ kind: "pas-bon" }]));
    expect(readRecents()).toEqual([]);
  });

  it("déduplique par chemin (insensible à la casse) et limite la taille", () => {
    let recents: RecentEntry[] = [];
    for (let index = 0; index < 20; index += 1) {
      recents = rememberRecent("file", `C:\\proj\\f${index}.ts`, `f${index}.ts`);
    }
    expect(recents).toHaveLength(12);
    const deduplicated = rememberRecent("file", "c:\\PROJ\\f19.ts", "f19.ts");
    expect(deduplicated).toHaveLength(12);
    // La déduplication est insensible à la casse mais le chemin fourni est
    // conservé tel quel (pas de réécriture de la casse).
    expect(deduplicated[0].path).toBe("c:\\PROJ\\f19.ts");
  });

  it("retire une entrée par chemin, sans la casse", () => {
    rememberRecent("file", "C:\\proj\\a.ts", "a.ts");
    const after = removeRecent("c:\\proj\\A.TS");
    expect(after).toEqual([]);
  });
});

describe("autosave", () => {
  it("est désactivé par défaut et persiste l'état", () => {
    expect(readAutosaveEnabled()).toBe(false);
    saveAutosaveEnabled(true);
    expect(readAutosaveEnabled()).toBe(true);
  });
});

describe("dernière session", () => {
  it("mémorise et relit un instantané valide", () => {
    rememberLastSession({ workspace: "C:\\proj", paths: ["C:\\proj\\a.ts"], activePath: null });
    expect(readLastSession()).toEqual({
      workspace: "C:\\proj",
      paths: ["C:\\proj\\a.ts"],
      activePath: null,
    });
  });

  it("rejette les instantanés invalides", () => {
    backing.set("code-notepad.last-session", JSON.stringify({ paths: "pas un tableau" }));
    expect(readLastSession()).toBeNull();
    backing.set("code-notepad.last-session", "%%");
    expect(readLastSession()).toBeNull();
  });
});

describe("tampons crash-safe", () => {
  it("stocke, relit et supprime un tampon", () => {
    saveBuffer("C:\\proj\\a.ts", {
      path: "C:\\proj\\a.ts",
      name: "a.ts",
      language: "typescript",
      contents: "const x = 1;",
      modifiedAt: 10,
    });
    expect(readBuffers()["C:\\proj\\a.ts"]?.contents).toBe("const x = 1;");
    clearBuffer("C:\\proj\\a.ts");
    expect(readBuffers()["C:\\proj\\a.ts"]).toBeUndefined();
  });

  it("ignore les tampons trop volumineux et les entrées invalides", () => {
    saveBuffer("gros", {
      path: null,
      name: "gros",
      language: "plaintext",
      contents: "x".repeat(500_000),
      modifiedAt: 1,
    });
    expect(readBuffers().gros).toBeUndefined();
    backing.set("code-notepad.buffers", JSON.stringify({ invalide: { pas: "bon" } }));
    expect(readBuffers().invalide).toBeUndefined();
  });
});
