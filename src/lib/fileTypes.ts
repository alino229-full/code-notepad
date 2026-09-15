import { fileNameFromPath } from "./paths";

// Types proposés dans les boîtes de dialogue ouvrir / enregistrer / renommer,
// pour filtrer d'un geste plutôt que saisir une extension à la main.
export const FILE_TYPE_FILTERS: { name: string; extensions: string[] }[] = [
  { name: "Tous les fichiers", extensions: ["*"] },
  { name: "Texte", extensions: ["txt"] },
  { name: "HTML", extensions: ["html", "htm"] },
  { name: "CSS", extensions: ["css", "scss", "less"] },
  { name: "JavaScript", extensions: ["js", "mjs", "cjs", "jsx"] },
  { name: "TypeScript", extensions: ["ts", "tsx", "mts", "cts"] },
  { name: "JSON", extensions: ["json"] },
  { name: "Markdown", extensions: ["md", "markdown"] },
  { name: "XML / SVG", extensions: ["xml", "svg"] },
  { name: "YAML", extensions: ["yml", "yaml"] },
  { name: "Python", extensions: ["py"] },
  { name: "Rust", extensions: ["rs"] },
  { name: "PHP", extensions: ["php"] },
  { name: "Java", extensions: ["java"] },
  { name: "C / C++", extensions: ["c", "h", "cc", "cpp", "hpp"] },
  { name: "C#", extensions: ["cs"] },
  { name: "SQL", extensions: ["sql"] },
  { name: "Shell / PowerShell", extensions: ["sh", "ps1"] },
];

// Extension par défaut selon le langage du document : préremplit le nom lors
// d'un premier enregistrement (« Nouveau-1 » + HTML → « Nouveau-1.html »).
export const LANGUAGE_DEFAULT_EXTENSIONS: Record<string, string> = {
  html: ".html",
  css: ".css",
  scss: ".scss",
  less: ".less",
  javascript: ".js",
  typescript: ".ts",
  json: ".json",
  markdown: ".md",
  xml: ".xml",
  yaml: ".yml",
  python: ".py",
  rust: ".rs",
  php: ".php",
  java: ".java",
  csharp: ".cs",
  cpp: ".cpp",
  c: ".c",
  sql: ".sql",
  shell: ".sh",
  vue: ".vue",
  svelte: ".svelte",
  plaintext: ".txt",
};

export function defaultExtensionForLanguage(language: string): string {
  return LANGUAGE_DEFAULT_EXTENSIONS[language] ?? ".txt";
}

export function fileNameHasExtension(path: string): boolean {
  const name = fileNameFromPath(path);
  // Un point en tête (« .gitignore ») n'est pas une extension.
  return name.lastIndexOf(".") > 0;
}
