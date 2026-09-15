import { describe, expect, it } from "vitest";

import {
  extensionFromPath,
  fileNameFromPath,
  fileUrlToPath,
  isPathWithin,
  isWindowsPlatform,
  joinPath,
  normalizeDialogPath,
  normalizePathWith,
  parentDirectory,
  pathEquals,
} from "./paths";

describe("normalizePathWith", () => {
  it("unifie les séparateurs et ignore la casse sur Windows", () => {
    expect(normalizePathWith("C:\\Users\\Léna\\Projet\\a.ts", true)).toBe(
      "c:/users/léna/projet/a.ts",
    );
  });

  it("préserve la casse hors de Windows", () => {
    expect(normalizePathWith("/Home/Dev/A.ts", false)).toBe("/Home/Dev/A.ts");
  });

  it("détecte la plateforme Windows à partir de navigator.platform", () => {
    expect(isWindowsPlatform("Win32")).toBe(true);
    expect(isWindowsPlatform("windows")).toBe(true);
    expect(isWindowsPlatform("Linux x86_64")).toBe(false);
    expect(isWindowsPlatform(undefined)).toBe(false);
  });
});

describe("pathEquals", () => {
  it("est insensible à la casse et aux séparateurs sur Windows", () => {
    expect(pathEquals("C:\\A\\B.ts", "c:/a/b.ts", true)).toBe(true);
  });

  it("reste sensible à la casse ailleurs", () => {
    expect(pathEquals("/srv/A.ts", "/srv/a.ts", false)).toBe(false);
  });
});

describe("isPathWithin", () => {
  it("refuse un simple préfixe commun sans frontière de dossier", () => {
    expect(isPathWithin("C:\\projet2\\f.ts", "C:\\projet", true)).toBe(false);
  });

  it("accepte un fichier du dossier et le dossier lui-même", () => {
    expect(isPathWithin("C:\\projet\\src\\f.ts", "C:\\projet\\", true)).toBe(true);
    expect(isPathWithin("C:\\projet", "C:\\projet", true)).toBe(true);
  });
});

describe("joinPath / parentDirectory / fileNameFromPath / extensionFromPath", () => {
  it("joint avec le séparateur détecté", () => {
    expect(joinPath("C:\\racine", "f.ts")).toBe("C:\\racine\\f.ts");
    expect(joinPath("/racine", "f.ts")).toBe("/racine/f.ts");
  });

  it("donne le dossier parent", () => {
    expect(parentDirectory("C:\\racine\\src\\f.ts")).toBe("C:\\racine\\src");
  });

  it("extrait le nom et l'extension", () => {
    expect(fileNameFromPath("C:\\a\\b\\x.TS")).toBe("x.TS");
    expect(extensionFromPath("C:\\a\\b\\x.TS")).toBe("ts");
    expect(extensionFromPath("Makefile")).toBe("");
  });
});

describe("normalizeDialogPath", () => {
  it("retire le préfixe verbatim de Windows", () => {
    expect(normalizeDialogPath("\\\\?\\C:\\Users\\a\\f.md")).toBe("C:\\Users\\a\\f.md");
    expect(normalizeDialogPath("/srv/f.md")).toBe("/srv/f.md");
  });
});

describe("fileUrlToPath", () => {
  it("convertit une URL file:// Windows", () => {
    expect(fileUrlToPath("file:///C:/proj/index.html")).toBe("C:\\proj\\index.html");
  });

  it("rejette les autres protocoles", () => {
    expect(fileUrlToPath("https://exemple.com")).toBeNull();
    expect(fileUrlToPath("n'importe quoi")).toBeNull();
  });
});
