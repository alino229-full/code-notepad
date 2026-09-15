import { describe, expect, it } from "vitest";

import { stripJsonComments } from "./jsonc";

describe("stripJsonComments", () => {
  it("retire les commentaires de ligne et de bloc", () => {
    const source = [
      "{",
      "  // commentaire de ligne",
      "  /* bloc",
      "     multi-ligne */",
      '  "nom": "valeur"',
      "}",
    ].join("\n");
    expect(JSON.parse(stripJsonComments(source))).toEqual({ nom: "valeur" });
  });

  it("préserve les commentaires et virgules à l'intérieur des chaînes", () => {
    const source = `{
  "motif": "a,}// pas un commentaire",
  "texte": "ligne\\ncommentaire // ici"
}`;
    const parsed = JSON.parse(stripJsonComments(source)) as { motif: string; texte: string };
    expect(parsed.motif).toBe("a,}// pas un commentaire");
    expect(parsed.texte).toBe("ligne\ncommentaire // ici");
  });

  it("retire les virgules traînantes hors des chaînes", () => {
    const source = `{
  "compilerOptions": {
    "baseUrl": ".",
    "strict": true,
  },
}`;
    expect(JSON.parse(stripJsonComments(source))).toEqual({
      compilerOptions: { baseUrl: ".", strict: true },
    });
  });

  it("gère les échappements dans les chaînes", () => {
    const source = `{ "citation": "\\" fin //", "a": 1 } // fin`;
    expect(JSON.parse(stripJsonComments(source))).toEqual({
      citation: '" fin //',
      a: 1,
    });
  });
});
