import "@fontsource/sora/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-600.css";

import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import * as monaco from "monaco-editor";

import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

import { icon, type IconName } from "./icons";
import { readRecents, readTheme, rememberRecent, removeRecent, saveTheme } from "./storage";
import type {
  DirectorySearchMatch,
  FileEntry,
  OpenDocument,
  RecentEntry,
  SearchOptions,
  SearchScope,
  Theme,
  TreeNode,
} from "./types";

// @ts-expect-error MonacoEnvironment is provided by Monaco at runtime.
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === "json") return new jsonWorker();
    if (["css", "scss", "less"].includes(label)) return new cssWorker();
    if (["html", "handlebars", "razor"].includes(label)) return new htmlWorker();
    if (["typescript", "javascript"].includes(label)) return new tsWorker();
    return new editorWorker();
  },
};

const isNativeApp = isTauri();
const appWindow = isNativeApp ? getCurrentWindow() : null;
const WORD_SEPARATORS = "~!@#$%^&*()-=+[{]}\\|;:'\",.<>/?";
const HTML_EXTENSIONS = new Set(["html", "htm"]);

function element<T extends Element>(selector: string): T {
  const result = document.querySelector<T>(selector);
  if (!result) throw new Error(`Élément introuvable : ${selector}`);
  return result;
}

const dom = {
  workspace: element<HTMLElement>("#workspace"),
  explorerPanel: element<HTMLElement>("#explorer-panel"),
  explorerTitle: element<HTMLElement>("#explorer-title"),
  explorerContent: element<HTMLElement>("#explorer-content"),
  explorerResizer: element<HTMLElement>("#explorer-resizer"),
  closeFolder: element<HTMLButtonElement>("#btn-close-folder"),
  editor: element<HTMLElement>("#editor"),
  welcome: element<HTMLElement>("#welcome"),
  tabs: element<HTMLElement>("#tabs"),
  previewPanel: element<HTMLElement>("#preview-panel"),
  previewResizer: element<HTMLElement>("#preview-resizer"),
  previewFrame: element<HTMLIFrameElement>("#preview-frame"),
  previewEmpty: element<HTMLElement>("#preview-empty"),
  previewPath: element<HTMLElement>("#preview-path"),
  previewRoute: element<HTMLElement>("#preview-route"),
  searchPanel: element<HTMLElement>("#search-panel"),
  searchQuery: element<HTMLInputElement>("#search-query"),
  replaceValue: element<HTMLInputElement>("#replace-value"),
  searchClear: element<HTMLButtonElement>("#search-clear"),
  searchCase: element<HTMLInputElement>("#search-case"),
  searchWord: element<HTMLInputElement>("#search-word"),
  searchRegex: element<HTMLInputElement>("#search-regex"),
  searchLive: element<HTMLInputElement>("#search-live"),
  searchCount: element<HTMLElement>("#search-count"),
  searchContext: element<HTMLElement>("#search-context"),
  searchPrevious: element<HTMLButtonElement>("#search-previous"),
  searchNext: element<HTMLButtonElement>("#search-next"),
  replaceOne: element<HTMLButtonElement>("#replace-one"),
  replaceAll: element<HTMLButtonElement>("#replace-all"),
  scopeFile: element<HTMLButtonElement>("#scope-file"),
  scopeFolder: element<HTMLButtonElement>("#scope-folder"),
  folderResults: element<HTMLElement>("#folder-results"),
  recentTrigger: element<HTMLButtonElement>("#recent-trigger"),
  recentMenu: element<HTMLElement>("#recent-menu"),
  fileMenuTrigger: element<HTMLButtonElement>("#menu-file-trigger"),
  fileMenu: element<HTMLElement>("#menu-file"),
  themeToggle: element<HTMLButtonElement>("#theme-toggle"),
  themeIcon: element<HTMLElement>("#theme-icon"),
  statusState: element<HTMLElement>("#status-state"),
  statusPath: element<HTMLElement>("#status-path"),
  statusPosition: element<HTMLElement>("#status-position"),
  languageSelect: element<HTMLSelectElement>("#language-select"),
  confirmDialog: element<HTMLDialogElement>("#confirm-dialog"),
  confirmDescription: element<HTMLElement>("#confirm-description"),
  confirmCancel: element<HTMLButtonElement>("#confirm-cancel"),
  toastRegion: element<HTMLElement>("#toast-region"),
};

monaco.editor.defineTheme("optical-light", {
  base: "vs",
  inherit: true,
  rules: [
    { token: "comment", foreground: "7B8894", fontStyle: "italic" },
    { token: "keyword", foreground: "1559D6", fontStyle: "bold" },
    { token: "string", foreground: "A13A52" },
    { token: "number", foreground: "7C3EB4" },
    { token: "tag", foreground: "0B6A77" },
    { token: "attribute.name", foreground: "B6481D" },
    { token: "type.identifier", foreground: "0F7182" },
  ],
  colors: {
    "editor.background": "#FFFFFF",
    "editor.foreground": "#263442",
    "editorLineNumber.foreground": "#A6B2BC",
    "editorLineNumber.activeForeground": "#176BFF",
    "editor.lineHighlightBackground": "#F2F7FC",
    "editor.selectionBackground": "#CFE0FF",
    "editor.inactiveSelectionBackground": "#E4ECF5",
    "editorCursor.foreground": "#176BFF",
    "editorIndentGuide.background1": "#E5EBEF",
    "editorIndentGuide.activeBackground1": "#B9C8D2",
    "editorBracketMatch.background": "#E6EFFF",
    "editorBracketMatch.border": "#176BFF",
    "editorWidget.background": "#FFFFFF",
    "editorWidget.border": "#DCE5EA",
    "editorGutter.background": "#FFFFFF",
    "minimap.background": "#F9FBFC",
    "scrollbarSlider.background": "#C8D5DD88",
    "scrollbarSlider.hoverBackground": "#9FB0BC99",
  },
});

monaco.editor.defineTheme("studio-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "778AA2", fontStyle: "italic" },
    { token: "keyword", foreground: "82B8FF", fontStyle: "bold" },
    { token: "string", foreground: "D7C47A" },
    { token: "number", foreground: "D9A6E9" },
    { token: "tag", foreground: "7CD5D1" },
    { token: "attribute.name", foreground: "F3A77C" },
    { token: "type.identifier", foreground: "8FD7C1" },
  ],
  colors: {
    "editor.background": "#1B273A",
    "editor.foreground": "#DCE5EE",
    "editorLineNumber.foreground": "#60738C",
    "editorLineNumber.activeForeground": "#F4B860",
    "editor.lineHighlightBackground": "#223148",
    "editor.selectionBackground": "#3C5677",
    "editor.inactiveSelectionBackground": "#30445E",
    "editorCursor.foreground": "#F4B860",
    "editorIndentGuide.background1": "#2D3D53",
    "editorIndentGuide.activeBackground1": "#536A85",
    "editorBracketMatch.background": "#3C352F",
    "editorBracketMatch.border": "#F4B860",
    "editorWidget.background": "#202D42",
    "editorWidget.border": "#40546D",
    "editorGutter.background": "#1B273A",
    "minimap.background": "#192538",
    "scrollbarSlider.background": "#40546D88",
    "scrollbarSlider.hoverBackground": "#60738CAA",
  },
});

const codeEditor = monaco.editor.create(dom.editor, {
  model: null,
  theme: "optical-light",
  automaticLayout: true,
  fontSize: 13,
  lineHeight: 22,
  fontFamily: "JetBrains Mono, Cascadia Code, Consolas, monospace",
  fontLigatures: true,
  padding: { top: 13, bottom: 18 },
  minimap: { enabled: true, showSlider: "mouseover", scale: 1 },
  stickyScroll: { enabled: true },
  smoothScrolling: true,
  cursorSmoothCaretAnimation: "on",
  cursorBlinking: "smooth",
  bracketPairColorization: { enabled: true },
  guides: { bracketPairs: "active", indentation: true },
  renderWhitespace: "selection",
  scrollBeyondLastLine: false,
  wordWrap: "off",
  tabSize: 2,
  insertSpaces: true,
  autoIndent: "full",
  formatOnPaste: true,
  find: {
    seedSearchStringFromSelection: "always",
    autoFindInSelection: "never",
  },
});

let documents: OpenDocument[] = [];
let activeDocumentId: string | null = null;
let workspaceRoot: TreeNode | null = null;
let recents: RecentEntry[] = readRecents();
let activeTheme: Theme = readTheme();
let searchScope: SearchScope = "file";
let fileMatches: monaco.editor.FindMatch[] = [];
let activeMatchIndex = -1;
let folderSearchGeneration = 0;
let searchTimer: number | undefined;
let isComposingSearch = false;
let previewVisible = false;
let explorerVisible = true;
let allowWindowClose = false;
let untitledCounter = 1;

function activeDocument(): OpenDocument | undefined {
  return documents.find((document) => document.id === activeDocumentId);
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function extensionFromPath(path: string): string {
  const name = fileNameFromPath(path);
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLocaleLowerCase() : "";
}

function guessLanguageFromPath(path: string): string {
  const extension = `.${extensionFromPath(path)}`;
  for (const language of monaco.languages.getLanguages()) {
    if (language.extensions?.includes(extension)) return language.id;
  }
  return "plaintext";
}

function pathEquals(left: string, right: string): boolean {
  return left.replace(/\\/g, "/").toLocaleLowerCase() === right.replace(/\\/g, "/").toLocaleLowerCase();
}

function isPathWithin(path: string, root: string): boolean {
  const normalizedPath = path.replace(/\\/g, "/").toLocaleLowerCase();
  const normalizedRoot = root.replace(/\\/g, "/").replace(/\/$/, "").toLocaleLowerCase();
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

function fileGlyph(language: string): HTMLElement {
  const glyph = document.createElement("span");
  glyph.className = `file-glyph ${language}`;
  const labels: Record<string, string> = {
    html: "H",
    css: "C",
    scss: "SC",
    javascript: "JS",
    typescript: "TS",
    json: "{}",
    markdown: "M",
    rust: "RS",
    php: "P",
    python: "PY",
  };
  glyph.textContent = labels[language] ?? "·";
  return glyph;
}

function injectStaticIcons(): void {
  document.querySelectorAll<HTMLElement>("[data-icon]").forEach((target) => {
    target.innerHTML = icon(target.dataset.icon as IconName);
  });
}

function populateLanguages(): void {
  dom.languageSelect.replaceChildren();
  const options = [
    { id: "plaintext", label: "Texte brut" },
    ...monaco.languages
      .getLanguages()
      .filter((language) => language.id !== "plaintext")
      .map((language) => ({ id: language.id, label: language.aliases?.[0] ?? language.id }))
      .sort((left, right) => left.label.localeCompare(right.label, "fr")),
  ];
  for (const language of options) {
    const option = document.createElement("option");
    option.value = language.id;
    option.textContent = language.label;
    dom.languageSelect.append(option);
  }
}

function applyTheme(theme: Theme, persist = true): void {
  activeTheme = theme;
  document.documentElement.dataset.theme = theme;
  monaco.editor.setTheme(theme === "light" ? "optical-light" : "studio-dark");
  dom.themeIcon.innerHTML = icon(theme === "light" ? "moon" : "sun");
  dom.themeToggle.setAttribute(
    "aria-label",
    theme === "light" ? "Activer le thème sombre" : "Activer le thème clair",
  );
  if (persist) saveTheme(theme);
}

function showToast(title: string, message: string, tone: "info" | "success" | "error" = "info"): void {
  const toast = document.createElement("div");
  toast.className = `toast ${tone}`;

  const indicator = document.createElement("span");
  indicator.className = "toast-indicator";

  const copy = document.createElement("span");
  copy.className = "toast-copy";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const detail = document.createElement("span");
  detail.textContent = message;
  copy.append(strong, detail);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Fermer la notification");
  closeButton.innerHTML = icon("close");
  closeButton.addEventListener("click", () => toast.remove());

  toast.append(indicator, copy, closeButton);
  dom.toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 5200);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function confirmDiscard(description: string): Promise<boolean> {
  dom.confirmDescription.textContent = description;
  dom.confirmDialog.showModal();
  window.setTimeout(() => dom.confirmCancel.focus(), 0);
  return new Promise((resolve) => {
    dom.confirmDialog.addEventListener(
      "close",
      () => resolve(dom.confirmDialog.returnValue === "confirm"),
      { once: true },
    );
  });
}

function createDocument(name: string, path: string | null, contents: string, language: string): OpenDocument {
  const uri = path
    ? monaco.Uri.parse(`file:///${path.replace(/\\/g, "/")}`)
    : monaco.Uri.parse(`untitled:///Nouveau-${untitledCounter}`);
  const model = monaco.editor.createModel(contents, language, uri);
  let documentRecord: OpenDocument;
  const disposeChangeListener = model.onDidChangeContent(() => {
    if (documentRecord.suppressDirty) return;
    if (!documentRecord.dirty) {
      documentRecord.dirty = true;
      renderTabs();
      renderStatus();
      void updateWindowTitle();
    }
  });
  documentRecord = {
    id: crypto.randomUUID(),
    name,
    path,
    language,
    model,
    dirty: false,
    suppressDirty: false,
    disposeChangeListener,
  };
  return documentRecord;
}

async function updateWindowTitle(): Promise<void> {
  const current = activeDocument();
  const label = current ? `${current.dirty ? "● " : ""}${current.name} — Code Notepad` : "Code Notepad";
  document.title = label;
  if (!appWindow) return;
  try {
    await appWindow.setTitle(label);
  } catch {
    // The browser preview used during development has no native window API.
  }
}

function renderTabs(): void {
  dom.tabs.replaceChildren();
  for (const documentRecord of documents) {
    const wrapper = document.createElement("div");
    wrapper.className = `tab${documentRecord.id === activeDocumentId ? " is-active" : ""}`;

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "tab-select";
    selectButton.role = "tab";
    selectButton.setAttribute("aria-selected", String(documentRecord.id === activeDocumentId));
    selectButton.tabIndex = documentRecord.id === activeDocumentId ? 0 : -1;
    selectButton.title = documentRecord.path ?? documentRecord.name;
    selectButton.append(fileGlyph(documentRecord.language));

    const name = document.createElement("span");
    name.className = "tab-name";
    name.textContent = documentRecord.name;
    selectButton.append(name);

    if (documentRecord.dirty) {
      const dirty = document.createElement("span");
      dirty.className = "tab-dirty";
      dirty.setAttribute("aria-label", "Modifications non enregistrées");
      selectButton.append(dirty);
    }

    selectButton.addEventListener("click", () => switchDocument(documentRecord.id));
    selectButton.addEventListener("keydown", (event) => {
      const currentIndex = documents.findIndex((candidate) => candidate.id === documentRecord.id);
      let nextIndex = currentIndex;
      if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + documents.length) % documents.length;
      else if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % documents.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = documents.length - 1;
      else return;
      event.preventDefault();
      switchDocument(documents[nextIndex].id);
      dom.tabs.querySelectorAll<HTMLButtonElement>(".tab-select")[nextIndex]?.focus();
    });

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "tab-close";
    closeButton.setAttribute("aria-label", `Fermer ${documentRecord.name}`);
    closeButton.title = `Fermer ${documentRecord.name}`;
    closeButton.innerHTML = icon("close");
    closeButton.addEventListener("click", () => void closeDocument(documentRecord.id));

    wrapper.append(selectButton, closeButton);
    dom.tabs.append(wrapper);
  }
}

function renderWelcome(): void {
  const current = activeDocument();
  dom.welcome.hidden = Boolean(current);
  dom.editor.classList.toggle("is-hidden", !current);
  if (current) return;

  dom.welcome.replaceChildren();
  const inner = document.createElement("div");
  inner.className = "welcome-inner";
  inner.innerHTML = `
    <div class="welcome-kicker">Édition locale, immédiate</div>
    <h2>Ouvrez le code.<br>Voyez le résultat.</h2>
    <p class="welcome-lead">Modifiez un fichier seul ou explorez tout un dossier. Les pages HTML peuvent être rendues ici avec leurs feuilles de style et scripts locaux.</p>
    <div class="welcome-actions">
      <button class="button-primary" type="button" data-welcome-action="folder">${icon("folderOpen")} Ouvrir un dossier</button>
      <button class="button-secondary" type="button" data-welcome-action="file">${icon("openFile")} Ouvrir un fichier</button>
      <button class="button-secondary" type="button" data-welcome-action="new">${icon("newFile")} Nouveau fichier</button>
    </div>
  `;

  inner.querySelector<HTMLButtonElement>('[data-welcome-action="folder"]')?.addEventListener("click", () => void openFolder());
  inner.querySelector<HTMLButtonElement>('[data-welcome-action="file"]')?.addEventListener("click", () => void chooseFile());
  inner.querySelector<HTMLButtonElement>('[data-welcome-action="new"]')?.addEventListener("click", newFile);

  if (recents.length > 0) {
    const recentSection = document.createElement("section");
    recentSection.className = "welcome-recents";
    const recentHeader = document.createElement("div");
    recentHeader.className = "welcome-recents-header";
    recentHeader.innerHTML = "<h3>Récemment ouverts</h3><small>Conservés hors de la session</small>";
    const list = document.createElement("ul");
    list.className = "welcome-recent-list";
    for (const recent of recents.slice(0, 6)) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "welcome-recent";
      button.title = recent.path;
      button.innerHTML = recent.kind === "folder" ? icon("folderOpen") : icon("file");
      const copy = document.createElement("span");
      copy.className = "welcome-recent-copy";
      const title = document.createElement("strong");
      title.textContent = recent.name;
      const path = document.createElement("small");
      path.textContent = recent.path;
      copy.append(title, path);
      button.append(copy);
      button.addEventListener("click", () => void openRecent(recent));
      item.append(button);
      list.append(item);
    }
    recentSection.append(recentHeader, list);
    inner.append(recentSection);
  }

  dom.welcome.append(inner);
}

function renderStatus(): void {
  const current = activeDocument();
  if (!current) {
    dom.statusState.textContent = "Prêt";
    dom.statusPath.textContent = workspaceRoot?.path ?? "Aucun fichier ouvert";
    dom.statusPath.title = workspaceRoot?.path ?? "";
    dom.statusPosition.textContent = "Ln 1, Col 1";
    dom.languageSelect.value = "plaintext";
    dom.languageSelect.disabled = true;
    element<HTMLButtonElement>("#btn-save").disabled = true;
    document.querySelectorAll<HTMLButtonElement>('[data-action="save"], [data-action="save-as"]').forEach((button) => {
      button.disabled = true;
    });
    return;
  }
  dom.statusState.textContent = current.dirty ? "Modifié" : current.path ? "Enregistré" : "Nouveau";
  dom.statusPath.textContent = current.path ?? "Nouveau fichier";
  dom.statusPath.title = current.path ?? "Nouveau fichier";
  const position = codeEditor.getPosition();
  dom.statusPosition.textContent = position ? `Ln ${position.lineNumber}, Col ${position.column}` : "Ln 1, Col 1";
  dom.languageSelect.disabled = false;
  dom.languageSelect.value = current.language;
  element<HTMLButtonElement>("#btn-save").disabled = false;
  document.querySelectorAll<HTMLButtonElement>('[data-action="save"], [data-action="save-as"]').forEach((button) => {
    button.disabled = false;
  });
}

function refreshChrome(): void {
  renderTabs();
  renderWelcome();
  renderExplorer();
  renderRecents();
  renderStatus();
  updatePreviewAvailability();
  void updateWindowTitle();
}

function switchDocument(id: string, line?: number, column?: number): void {
  const next = documents.find((document) => document.id === id);
  if (!next) return;
  activeDocumentId = id;
  codeEditor.setModel(next.model);
  if (line) {
    const position = { lineNumber: line, column: column ?? 1 };
    codeEditor.setPosition(position);
    codeEditor.revealPositionInCenter(position, monaco.editor.ScrollType.Smooth);
  }
  codeEditor.focus();
  refreshChrome();
  if (previewVisible) void refreshPreview(false);
}

function newFile(): void {
  const name = `Nouveau-${untitledCounter++}`;
  const documentRecord = createDocument(name, null, "", "plaintext");
  documents.push(documentRecord);
  switchDocument(documentRecord.id);
}

async function chooseFile(): Promise<void> {
  const selected = await open({
    multiple: false,
    filters: [
      {
        name: "Code et texte",
        extensions: [
          "html", "htm", "css", "scss", "less", "js", "mjs", "cjs", "ts", "tsx", "jsx", "json",
          "md", "txt", "xml", "yaml", "yml", "php", "py", "rs", "go", "java", "kt", "dart", "sql",
          "sh", "ps1", "c", "h", "cpp", "hpp", "cs", "swift", "vue", "svelte",
        ],
      },
      { name: "Tous les fichiers", extensions: ["*"] },
    ],
  });
  if (!selected || Array.isArray(selected)) return;
  await openFilePath(selected);
}

async function openFilePath(path: string, line?: number, column?: number): Promise<void> {
  const existing = documents.find((document) => document.path && pathEquals(document.path, path));
  if (existing) {
    switchDocument(existing.id, line, column);
    return;
  }

  try {
    dom.statusState.textContent = "Ouverture…";
    const contents = await invoke<string>("read_file", { path });
    const language = guessLanguageFromPath(path);
    const documentRecord = createDocument(fileNameFromPath(path), path, contents, language);
    documents.push(documentRecord);
    recents = rememberRecent("file", path, documentRecord.name);
    switchDocument(documentRecord.id, line, column);
    if (HTML_EXTENSIONS.has(extensionFromPath(path))) {
      setPreviewVisible(true);
      await refreshPreview(false);
    }
  } catch (error) {
    recents = removeRecent(path);
    refreshChrome();
    showToast("Fichier non ouvert", `${fileNameFromPath(path)} : ${errorMessage(error)}`, "error");
  }
}

async function saveDocument(documentRecord = activeDocument(), saveAs = false): Promise<boolean> {
  if (!documentRecord) return false;
  let target = documentRecord.path;
  if (!target || saveAs) {
    const selected = await save({
      defaultPath: target ?? `${documentRecord.name}.txt`,
      filters: [{ name: "Tous les fichiers", extensions: ["*"] }],
    });
    if (!selected) return false;
    target = selected;
  }

  try {
    dom.statusState.textContent = "Enregistrement…";
    await invoke("write_file", { path: target, contents: documentRecord.model.getValue() });
    documentRecord.path = target;
    documentRecord.name = fileNameFromPath(target);
    documentRecord.language = guessLanguageFromPath(target);
    monaco.editor.setModelLanguage(documentRecord.model, documentRecord.language);
    documentRecord.dirty = false;
    recents = rememberRecent("file", target, documentRecord.name);
    refreshChrome();
    showToast("Enregistré", documentRecord.name, "success");
    return true;
  } catch (error) {
    renderStatus();
    showToast("Enregistrement impossible", `${documentRecord.name} : ${errorMessage(error)}`, "error");
    return false;
  }
}

function disposeDocument(documentRecord: OpenDocument): void {
  documentRecord.disposeChangeListener.dispose();
  documentRecord.model.dispose();
}

async function closeDocument(id: string, skipConfirmation = false): Promise<boolean> {
  const index = documents.findIndex((document) => document.id === id);
  if (index < 0) return true;
  const documentRecord = documents[index];
  if (documentRecord.dirty && !skipConfirmation) {
    const confirmed = await confirmDiscard(
      `« ${documentRecord.name} » contient des modifications non enregistrées. Fermer ce fichier retirera ces modifications de la session.`,
    );
    if (!confirmed) return false;
  }

  documents.splice(index, 1);
  disposeDocument(documentRecord);
  if (activeDocumentId === id) {
    const next = documents[Math.min(index, documents.length - 1)];
    activeDocumentId = next?.id ?? null;
    codeEditor.setModel(next?.model ?? null);
  }
  refreshChrome();
  if (previewVisible) await refreshPreview(false);
  return true;
}

async function openFolder(): Promise<void> {
  const selected = await open({ directory: true, multiple: false });
  if (!selected || Array.isArray(selected)) return;
  await openFolderPath(selected);
}

async function openFolderPath(path: string): Promise<void> {
  if (workspaceRoot && pathEquals(workspaceRoot.path, path)) return;
  if (workspaceRoot && !(await closeWorkspace(true))) return;

  try {
    dom.statusState.textContent = "Lecture du dossier…";
    const children = await invoke<FileEntry[]>("list_directory", { path });
    workspaceRoot = {
      name: fileNameFromPath(path),
      path,
      isDirectory: true,
      isSymlink: false,
      expanded: true,
      children: children.map(toTreeNode),
    };
    recents = rememberRecent("folder", path, workspaceRoot.name);
    refreshChrome();
    showToast("Dossier ouvert", workspaceRoot.name, "success");
  } catch (error) {
    recents = removeRecent(path);
    workspaceRoot = null;
    refreshChrome();
    showToast("Dossier non ouvert", `${fileNameFromPath(path)} : ${errorMessage(error)}`, "error");
  }
}

function toTreeNode(entry: FileEntry): TreeNode {
  return { ...entry, expanded: false };
}

async function toggleFolderNode(node: TreeNode): Promise<void> {
  if (!node.isDirectory) return;
  if (node.expanded) {
    node.expanded = false;
    renderExplorer();
    return;
  }
  node.expanded = true;
  if (!node.children) {
    node.loading = true;
    renderExplorer();
    try {
      const children = await invoke<FileEntry[]>("list_directory", { path: node.path });
      node.children = children.map(toTreeNode);
    } catch (error) {
      node.expanded = false;
      showToast("Dossier illisible", `${node.name} : ${errorMessage(error)}`, "error");
    } finally {
      node.loading = false;
    }
  }
  renderExplorer();
}

function renderTree(nodes: TreeNode[]): HTMLUListElement {
  const list = document.createElement("ul");
  list.className = "tree-list";
  for (const node of nodes) {
    const item = document.createElement("li");
    const row = document.createElement("div");
    row.className = `tree-row${activeDocument()?.path && pathEquals(activeDocument()!.path!, node.path) ? " is-active" : ""}`;

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "tree-toggle";
    if (node.isDirectory) {
      toggle.setAttribute("aria-label", `${node.expanded ? "Réduire" : "Développer"} ${node.name}`);
      toggle.innerHTML = icon(node.expanded ? "chevronDown" : "chevronRight");
      toggle.addEventListener("click", () => void toggleFolderNode(node));
    } else {
      toggle.disabled = true;
      toggle.setAttribute("aria-hidden", "true");
    }

    const action = document.createElement("button");
    action.type = "button";
    action.className = "tree-file-action";
    action.title = node.path;
    if (node.isDirectory) {
      action.innerHTML = icon(node.expanded ? "folderOpen" : "folder");
      action.addEventListener("click", () => void toggleFolderNode(node));
    } else {
      action.append(fileGlyph(guessLanguageFromPath(node.path)));
      action.addEventListener("click", () => void openFilePath(node.path));
    }
    const name = document.createElement("span");
    name.className = "tree-name";
    name.textContent = node.loading ? `${node.name} — chargement…` : node.name;
    action.append(name);

    row.append(toggle, action);
    item.append(row);
    if (node.isDirectory && node.expanded && node.children) {
      const children = renderTree(node.children);
      children.classList.add("tree-children");
      item.append(children);
    }
    list.append(item);
  }
  return list;
}

function renderExplorer(): void {
  dom.explorerContent.replaceChildren();
  dom.closeFolder.hidden = !workspaceRoot;
  dom.explorerTitle.textContent = workspaceRoot?.name ?? "Explorateur";
  dom.explorerTitle.title = workspaceRoot?.path ?? "Explorateur";

  if (!workspaceRoot) {
    const empty = document.createElement("div");
    empty.className = "explorer-empty";
    empty.innerHTML = `
      <span class="empty-orbit">${icon("folderOpen")}</span>
      <strong>Aucun dossier dans la session</strong>
      <p>Ouvrez un dossier pour parcourir ses fichiers et sous-dossiers.</p>
      <button class="button-secondary" type="button">${icon("folderOpen")} Ouvrir un dossier</button>
    `;
    empty.querySelector("button")?.addEventListener("click", () => void openFolder());
    dom.explorerContent.append(empty);
    return;
  }

  dom.explorerContent.append(renderTree(workspaceRoot.children ?? []));
}

async function closeWorkspace(replacing = false): Promise<boolean> {
  if (!workspaceRoot) return true;
  const affected = documents.filter(
    (document) => document.path && isPathWithin(document.path, workspaceRoot!.path),
  );
  const dirty = affected.filter((document) => document.dirty);
  if (dirty.length > 0) {
    const confirmed = await confirmDiscard(
      `${dirty.length} fichier${dirty.length > 1 ? "s" : ""} du dossier contien${dirty.length > 1 ? "nent" : "t"} des modifications non enregistrées. ${replacing ? "Ouvrir un autre dossier" : "Fermer ce dossier"} les retirera de la session.`,
    );
    if (!confirmed) return false;
  }
  for (const documentRecord of affected) {
    await closeDocument(documentRecord.id, true);
  }
  workspaceRoot = null;
  searchScope = "file";
  refreshChrome();
  return true;
}

async function openRecent(recent: RecentEntry): Promise<void> {
  closeMenus();
  if (recent.kind === "folder") await openFolderPath(recent.path);
  else await openFilePath(recent.path);
}

function renderRecents(): void {
  dom.recentMenu.replaceChildren();
  if (recents.length === 0) {
    const empty = document.createElement("div");
    empty.className = "recent-empty";
    empty.textContent = "Aucun fichier ou dossier récent";
    dom.recentMenu.append(empty);
    return;
  }

  for (const recent of recents) {
    const button = document.createElement("button");
    button.type = "button";
    button.role = "menuitem";
    button.className = "recent-item";
    button.title = recent.path;
    const main = document.createElement("span");
    main.className = "recent-item-main";
    main.innerHTML = recent.kind === "folder" ? icon("folderOpen") : icon("file");
    const copy = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = recent.name;
    const path = document.createElement("small");
    path.textContent = recent.path;
    copy.append(title, path);
    main.append(copy);
    button.append(main);
    button.addEventListener("click", () => void openRecent(recent));
    dom.recentMenu.append(button);
  }

  const separator = document.createElement("span");
  separator.className = "menu-separator";
  separator.role = "separator";
  const clear = document.createElement("button");
  clear.type = "button";
  clear.role = "menuitem";
  clear.textContent = "Effacer la liste des récents";
  clear.addEventListener("click", () => {
    for (const recent of recents) removeRecent(recent.path);
    recents = [];
    renderRecents();
    renderWelcome();
  });
  dom.recentMenu.append(separator, clear);
}

function toggleMenu(trigger: HTMLButtonElement, menu: HTMLElement): void {
  const openMenu = menu.hidden;
  closeMenus();
  if (openMenu) {
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    menu.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
  }
}

function closeMenus(): void {
  dom.fileMenu.hidden = true;
  dom.recentMenu.hidden = true;
  dom.fileMenuTrigger.setAttribute("aria-expanded", "false");
  dom.recentTrigger.setAttribute("aria-expanded", "false");
}

function isHtmlDocument(
  documentRecord = activeDocument(),
): documentRecord is OpenDocument & { path: string } {
  return Boolean(documentRecord?.path && HTML_EXTENSIONS.has(extensionFromPath(documentRecord.path)));
}

function setPreviewVisible(visible: boolean): void {
  previewVisible = visible;
  dom.previewPanel.hidden = !visible;
  dom.previewResizer.hidden = !visible;
  element<HTMLButtonElement>("#btn-toggle-preview").setAttribute("aria-pressed", String(visible));
  window.setTimeout(() => codeEditor.layout(), 0);
  updatePreviewAvailability();
}

function updatePreviewAvailability(): void {
  const available = isHtmlDocument();
  dom.previewRoute.classList.toggle("is-active", previewVisible && available);
  if (!previewVisible) return;
  if (!available) {
    dom.previewFrame.hidden = true;
    dom.previewFrame.removeAttribute("src");
    dom.previewEmpty.hidden = false;
    dom.previewPath.textContent = "Sélectionnez un fichier HTML enregistré";
  }
}

async function refreshPreview(saveBefore: boolean): Promise<void> {
  const current = activeDocument();
  if (!isHtmlDocument(current)) {
    updatePreviewAvailability();
    return;
  }
  if (saveBefore && current.dirty && !(await saveDocument(current))) return;

  try {
    dom.previewPath.textContent = "Préparation du rendu…";
    const prepared = await invoke<string>("prepare_preview", {
      path: current.path,
      workspaceRoot: workspaceRoot?.path ?? null,
    });
    const separator = prepared.includes("?") ? "&" : "?";
    dom.previewFrame.src = `${prepared}${separator}refresh=${Date.now()}`;
    dom.previewFrame.hidden = false;
    dom.previewEmpty.hidden = true;
    dom.previewPath.textContent = current.path;
    dom.previewPath.title = current.path;
    dom.previewRoute.classList.add("is-active");
  } catch (error) {
    dom.previewFrame.hidden = true;
    dom.previewEmpty.hidden = false;
    dom.previewPath.textContent = "Aperçu indisponible";
    showToast("Aperçu impossible", errorMessage(error), "error");
  }
}

function searchOptions(): SearchOptions {
  return {
    caseSensitive: dom.searchCase.checked,
    wholeWord: dom.searchWord.checked,
    regex: dom.searchRegex.checked,
  };
}

function setSearchCount(message: string, error = false): void {
  dom.searchCount.textContent = message;
  dom.searchCount.classList.toggle("is-error", error);
}

function updateSearchControls(): void {
  const hasQuery = dom.searchQuery.value.length > 0;
  const fileScope = searchScope === "file";
  dom.searchClear.hidden = !hasQuery;
  dom.searchPrevious.disabled = !fileScope || fileMatches.length === 0;
  dom.searchNext.disabled = !fileScope || fileMatches.length === 0;
  dom.replaceOne.disabled = !fileScope || fileMatches.length === 0;
  dom.replaceAll.disabled = !fileScope || fileMatches.length === 0;
  dom.scopeFolder.disabled = !workspaceRoot;
  dom.scopeFile.setAttribute("aria-pressed", String(fileScope));
  dom.scopeFolder.setAttribute("aria-pressed", String(!fileScope));
  dom.searchContext.textContent = fileScope
    ? `Dans ${activeDocument()?.name ?? "le fichier actif"}`
    : `Dans ${workspaceRoot?.name ?? "le dossier"}`;
}

function openSearchPanel(): void {
  dom.searchPanel.hidden = false;
  const selection = codeEditor.getSelection();
  const selectedText = selection && !selection.isEmpty() ? codeEditor.getModel()?.getValueInRange(selection) : "";
  if (selectedText && !selectedText.includes("\n")) dom.searchQuery.value = selectedText;
  updateSearchControls();
  dom.searchQuery.focus();
  dom.searchQuery.select();
  if (dom.searchQuery.value) runSearch(true);
}

function closeSearchPanel(): void {
  dom.searchPanel.hidden = true;
  dom.folderResults.hidden = true;
  folderSearchGeneration += 1;
  codeEditor.focus();
}

function runSearch(selectFirst = false): void {
  window.clearTimeout(searchTimer);
  if (searchScope === "folder") void runFolderSearch();
  else runFileSearch(selectFirst);
}

function runFileSearch(selectFirst = false): void {
  const query = dom.searchQuery.value;
  const current = activeDocument();
  fileMatches = [];
  activeMatchIndex = -1;
  dom.folderResults.hidden = true;
  if (!query || !current) {
    setSearchCount(query ? "Aucun fichier actif" : "Saisissez un terme");
    updateSearchControls();
    return;
  }

  const options = searchOptions();
  try {
    fileMatches = current.model.findMatches(
      query,
      false,
      options.regex,
      options.caseSensitive,
      options.wholeWord ? WORD_SEPARATORS : null,
      true,
      10000,
    );
    setSearchCount(`${fileMatches.length} occurrence${fileMatches.length > 1 ? "s" : ""}`);
    if (selectFirst && fileMatches.length > 0) selectMatch(0);
  } catch {
    setSearchCount("Expression régulière invalide", true);
  }
  updateSearchControls();
}

function selectMatch(index: number): void {
  if (fileMatches.length === 0) return;
  activeMatchIndex = (index + fileMatches.length) % fileMatches.length;
  const match = fileMatches[activeMatchIndex];
  codeEditor.setSelection(match.range);
  codeEditor.revealRangeInCenter(match.range, monaco.editor.ScrollType.Smooth);
  setSearchCount(`${activeMatchIndex + 1} sur ${fileMatches.length}`);
}

async function runFolderSearch(): Promise<void> {
  const query = dom.searchQuery.value;
  const root = workspaceRoot;
  fileMatches = [];
  activeMatchIndex = -1;
  dom.folderResults.hidden = false;
  dom.folderResults.replaceChildren();
  if (!query || !root) {
    setSearchCount(query ? "Ouvrez d’abord un dossier" : "Saisissez un terme");
    updateSearchControls();
    return;
  }

  const generation = ++folderSearchGeneration;
  setSearchCount("Recherche dans le dossier…");
  updateSearchControls();
  try {
    const matches = await invoke<DirectorySearchMatch[]>("search_directory", {
      root: root.path,
      query,
      options: searchOptions(),
    });
    if (generation !== folderSearchGeneration) return;
    renderFolderResults(matches);
    setSearchCount(`${matches.length} résultat${matches.length > 1 ? "s" : ""}`);
  } catch (error) {
    if (generation !== folderSearchGeneration) return;
    setSearchCount(errorMessage(error), true);
    renderFolderResults([]);
  }
  updateSearchControls();
}

function renderFolderResults(matches: DirectorySearchMatch[]): void {
  dom.folderResults.replaceChildren();
  if (matches.length === 0) {
    const empty = document.createElement("div");
    empty.className = "results-empty";
    empty.textContent = "Aucune correspondance dans les fichiers texte du dossier.";
    dom.folderResults.append(empty);
    return;
  }

  for (const match of matches) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "folder-result";
    button.title = match.path;
    const path = document.createElement("span");
    path.className = "folder-result-path";
    path.textContent = match.relativePath;
    const line = document.createElement("span");
    line.className = "folder-result-line";
    line.textContent = `L${match.line}:${match.column}`;
    const text = document.createElement("span");
    text.className = "folder-result-text";
    text.textContent = match.lineText.trim();
    button.append(path, line, text);
    button.addEventListener("click", () => void openFilePath(match.path, match.line, match.column));
    dom.folderResults.append(button);
  }
}

function replacementFor(match: monaco.editor.FindMatch, replacement: string): string {
  const current = activeDocument();
  if (!current || !dom.searchRegex.checked) return replacement;
  try {
    const flags = dom.searchCase.checked ? "" : "i";
    const expression = new RegExp(dom.searchQuery.value, flags);
    return current.model.getValueInRange(match.range).replace(expression, replacement);
  } catch {
    return replacement;
  }
}

function replaceCurrent(): void {
  if (fileMatches.length === 0) return;
  if (activeMatchIndex < 0) activeMatchIndex = 0;
  const match = fileMatches[activeMatchIndex];
  codeEditor.executeEdits("advanced-search", [
    { range: match.range, text: replacementFor(match, dom.replaceValue.value), forceMoveMarkers: true },
  ]);
  runFileSearch(true);
}

function replaceEveryMatch(): void {
  if (fileMatches.length === 0) return;
  const replacement = dom.replaceValue.value;
  codeEditor.executeEdits(
    "advanced-search",
    fileMatches.map((match) => ({
      range: match.range,
      text: replacementFor(match, replacement),
      forceMoveMarkers: true,
    })),
  );
  runFileSearch(false);
}

function setSearchScope(scope: SearchScope): void {
  if (scope === "folder" && !workspaceRoot) {
    showToast("Recherche dans le dossier", "Ouvrez un dossier pour utiliser cette portée.");
    return;
  }
  searchScope = scope;
  dom.folderResults.hidden = scope === "file";
  updateSearchControls();
  runSearch(true);
}

function scheduleLiveSearch(): void {
  window.clearTimeout(searchTimer);
  dom.searchClear.hidden = dom.searchQuery.value.length === 0;
  if (!dom.searchLive.checked || isComposingSearch) return;
  searchTimer = window.setTimeout(() => runSearch(true), searchScope === "folder" ? 300 : 80);
}

function makeResizable(
  resizer: HTMLElement,
  onDelta: (clientX: number) => void,
  onKeyboard: (direction: number) => void,
): void {
  resizer.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    resizer.classList.add("is-dragging");
    const move = (moveEvent: PointerEvent): void => onDelta(moveEvent.clientX);
    const stop = (): void => {
      resizer.classList.remove("is-dragging");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      codeEditor.layout();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  });
  resizer.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    onKeyboard(event.key === "ArrowRight" ? 1 : -1);
    codeEditor.layout();
  });
}

function setupResizers(): void {
  makeResizable(
    dom.explorerResizer,
    (clientX) => {
      const next = Math.max(185, Math.min(420, clientX));
      document.documentElement.style.setProperty("--explorer-width", `${next}px`);
    },
    (direction) => {
      const current = dom.explorerPanel.getBoundingClientRect().width;
      const next = Math.max(185, Math.min(420, current + direction * 16));
      document.documentElement.style.setProperty("--explorer-width", `${next}px`);
    },
  );

  makeResizable(
    dom.previewResizer,
    (clientX) => {
      const next = Math.max(340, Math.min(window.innerWidth * 0.62, window.innerWidth - clientX));
      document.documentElement.style.setProperty("--preview-width", `${next}px`);
    },
    (direction) => {
      const current = dom.previewPanel.getBoundingClientRect().width;
      const next = Math.max(340, Math.min(window.innerWidth * 0.62, current - direction * 16));
      document.documentElement.style.setProperty("--preview-width", `${next}px`);
    },
  );
}

async function requestWindowClose(): Promise<void> {
  if (!appWindow) return;
  const dirty = documents.filter((document) => document.dirty);
  if (dirty.length > 0) {
    const confirmed = await confirmDiscard(
      `${dirty.length} fichier${dirty.length > 1 ? "s contiennent" : " contient"} des modifications non enregistrées. Fermer l’application supprimera ces modifications de la session.`,
    );
    if (!confirmed) return;
  }
  allowWindowClose = true;
  await appWindow.close();
}

function registerActions(): void {
  element<HTMLButtonElement>("#btn-new").addEventListener("click", newFile);
  element<HTMLButtonElement>("#btn-open").addEventListener("click", () => void chooseFile());
  element<HTMLButtonElement>("#btn-open-folder").addEventListener("click", () => void openFolder());
  element<HTMLButtonElement>("#btn-save").addEventListener("click", () => void saveDocument());
  element<HTMLButtonElement>("#btn-search").addEventListener("click", openSearchPanel);
  element<HTMLButtonElement>("#btn-toggle-explorer").addEventListener("click", () => {
    explorerVisible = !explorerVisible;
    dom.explorerPanel.hidden = !explorerVisible;
    dom.explorerResizer.hidden = !explorerVisible;
    window.setTimeout(() => codeEditor.layout(), 0);
  });
  element<HTMLButtonElement>("#btn-toggle-preview").addEventListener("click", () => {
    setPreviewVisible(!previewVisible);
    if (previewVisible) void refreshPreview(false);
  });
  element<HTMLButtonElement>("#preview-close").addEventListener("click", () => setPreviewVisible(false));
  element<HTMLButtonElement>("#preview-refresh").addEventListener("click", () => void refreshPreview(true));
  element<HTMLButtonElement>("#preview-external").addEventListener("click", () => {
    const current = activeDocument();
    if (current?.path && isHtmlDocument(current)) void openPath(current.path);
  });
  dom.closeFolder.addEventListener("click", () => void closeWorkspace());

  dom.themeToggle.addEventListener("click", () => applyTheme(activeTheme === "light" ? "dark" : "light"));
  dom.fileMenuTrigger.addEventListener("click", () => toggleMenu(dom.fileMenuTrigger, dom.fileMenu));
  dom.recentTrigger.addEventListener("click", () => toggleMenu(dom.recentTrigger, dom.recentMenu));

  document.querySelectorAll<HTMLElement>("[data-action]").forEach((target) => {
    target.addEventListener("click", () => {
      closeMenus();
      switch (target.dataset.action) {
        case "new-file": newFile(); break;
        case "open-file": void chooseFile(); break;
        case "open-folder": void openFolder(); break;
        case "save": void saveDocument(); break;
        case "save-as": void saveDocument(activeDocument(), true); break;
        case "open-search": openSearchPanel(); break;
        case "toggle-preview":
          setPreviewVisible(!previewVisible);
          if (previewVisible) void refreshPreview(false);
          break;
      }
    });
  });

  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (target instanceof Node && !dom.fileMenu.contains(target) && !dom.fileMenuTrigger.contains(target) &&
      !dom.recentMenu.contains(target) && !dom.recentTrigger.contains(target)) {
      closeMenus();
    }
  });

  dom.searchQuery.addEventListener("compositionstart", () => { isComposingSearch = true; });
  dom.searchQuery.addEventListener("compositionend", () => {
    isComposingSearch = false;
    scheduleLiveSearch();
  });
  dom.searchQuery.addEventListener("input", scheduleLiveSearch);
  dom.searchQuery.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      runSearch(true);
    }
    if (event.key === "Escape") closeSearchPanel();
  });
  dom.searchClear.addEventListener("click", () => {
    window.clearTimeout(searchTimer);
    folderSearchGeneration += 1;
    dom.searchQuery.value = "";
    fileMatches = [];
    dom.folderResults.replaceChildren();
    dom.folderResults.hidden = searchScope === "file";
    setSearchCount("Saisissez un terme");
    updateSearchControls();
    dom.searchQuery.focus();
  });
  [dom.searchCase, dom.searchWord, dom.searchRegex].forEach((control) => {
    control.addEventListener("change", () => runSearch(true));
  });
  dom.searchLive.addEventListener("change", scheduleLiveSearch);
  element<HTMLButtonElement>("#search-submit").addEventListener("click", () => runSearch(true));
  element<HTMLButtonElement>("#search-close").addEventListener("click", closeSearchPanel);
  dom.searchPrevious.addEventListener("click", () => selectMatch(activeMatchIndex - 1));
  dom.searchNext.addEventListener("click", () => selectMatch(activeMatchIndex + 1));
  dom.replaceOne.addEventListener("click", replaceCurrent);
  dom.replaceAll.addEventListener("click", replaceEveryMatch);
  dom.scopeFile.addEventListener("click", () => setSearchScope("file"));
  dom.scopeFolder.addEventListener("click", () => setSearchScope("folder"));

  dom.languageSelect.addEventListener("change", () => {
    const current = activeDocument();
    if (!current) return;
    current.language = dom.languageSelect.value;
    monaco.editor.setModelLanguage(current.model, current.language);
    renderTabs();
  });

  element<HTMLButtonElement>("#window-minimize").addEventListener("click", () => {
    if (appWindow) void appWindow.minimize();
  });
  element<HTMLButtonElement>("#window-maximize").addEventListener("click", () => {
    if (appWindow) void appWindow.toggleMaximize();
  });
  element<HTMLButtonElement>("#window-close").addEventListener("click", () => void requestWindowClose());

  window.addEventListener("keydown", (event) => {
    const control = event.ctrlKey || event.metaKey;
    if (!control) {
      if (event.key === "Escape" && !dom.searchPanel.hidden) closeSearchPanel();
      else if (event.key === "Escape") closeMenus();
      return;
    }
    const key = event.key.toLocaleLowerCase();
    const handled =
      key === "n" || key === "o" || key === "k" || key === "s" || key === "f" ||
      key === "w" || (key === "v" && event.shiftKey);
    if (!handled) return;
    event.preventDefault();
    event.stopPropagation();
    if (key === "n") {
      newFile();
    } else if (key === "o") {
      void chooseFile();
    } else if (key === "k") {
      void openFolder();
    } else if (key === "s" && event.shiftKey) {
      void saveDocument(activeDocument(), true);
    } else if (key === "s") {
      void saveDocument();
    } else if (key === "f") {
      openSearchPanel();
    } else if (key === "v" && event.shiftKey) {
      setPreviewVisible(!previewVisible);
      if (previewVisible) void refreshPreview(false);
    } else if (key === "w") {
      const current = activeDocument();
      if (current) void closeDocument(current.id);
    }
  }, true);

  codeEditor.onDidChangeCursorPosition(renderStatus);
  codeEditor.onDidChangeModel(() => {
    renderStatus();
    updatePreviewAvailability();
  });

  if (appWindow) {
    void appWindow.onCloseRequested((event) => {
      if (allowWindowClose || !documents.some((document) => document.dirty)) return;
      event.preventDefault();
      void requestWindowClose();
    });
  }
}

injectStaticIcons();
populateLanguages();
applyTheme(activeTheme, false);
setupResizers();
registerActions();
refreshChrome();
