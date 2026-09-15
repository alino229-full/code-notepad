import { describe, expect, it } from "vitest";

import {
  defaultExtensionForLanguage,
  FILE_TYPE_FILTERS,
  fileNameHasExtension,
  LANGUAGE_DEFAULT_EXTENSIONS,
} from "./fileTypes";

describe("FILE_TYPE_FILTERS", () => {
  it("commence par « Tous les fichiers » et n'a pas de doublons d'extensions", () => {
    expect(FILE_TYPE_FILTERS[0]).toEqual({ name: "Tous les fichiers", extensions: ["*"] });
    const seen = new Set<string>();
    for (const filter of FILE_TYPE_FILTERS) {
      for (const extension of filter.extensions) {
        expect(seen.has(extension), `extension dupliquée : ${extension}`).toBe(false);
        seen.add(extension);
      }
    }
  });

  it("écrit toutes les extensions en minuscules", () => {
    for (const filter of FILE_TYPE_FILTERS) {
      for (const extension of filter.extensions) {
        expect(extension).toBe(extension.toLocaleLowerCase());
      }
    }
  });
});

describe("defaultExtensionForLanguage", () => {
  it("couvre les langages courants", () => {
    expect(defaultExtensionForLanguage("html")).toBe(".html");
    expect(defaultExtensionForLanguage("typescript")).toBe(".ts");
    expect(defaultExtensionForLanguage("markdown")).toBe(".md");
    expect(defaultExtensionForLanguage("plaintext")).toBe(".txt");
  });

  it("retombe sur .txt pour un langage inconnu", () => {
    expect(defaultExtensionForLanguage("langage-inventé")).toBe(".txt");
  });

  it("associe chaque extension déclarée à un langage", () => {
    for (const [language, extension] of Object.entries(LANGUAGE_DEFAULT_EXTENSIONS)) {
      expect(extension.startsWith("."), `langage ${language}`).toBe(true);
    }
  });
});

describe("fileNameHasExtension", () => {
  it("détecte une extension classique", () => {
    expect(fileNameHasExtension("C:\\proj\\index.html")).toBe(true);
    expect(fileNameHasExtension("notes.md")).toBe(true);
  });

  it("ne compte pas le point de tête comme une extension", () => {
    expect(fileNameHasExtension("C:\\proj\\.gitignore")).toBe(false);
    expect(fileNameHasExtension("Makefile")).toBe(false);
  });
});
