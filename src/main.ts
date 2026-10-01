import "@fontsource/sora/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-600.css";

import { listen } from "@tauri-apps/api/event";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import * as monaco from "monaco-editor";

import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

import { icon, type IconName } from "./icons";
import {
  clearBuffer,
  readAutosaveEnabled,
  readBuffers,
  readLastSession,
  readRecents,
  readTheme,
  rememberLastSession,
  rememberRecent,
  removeRecent,
  saveAutosaveEnabled,
  saveBuffer,
  saveTheme,
  type SessionSnapshotData,
} from "./storage";
import {
  defaultExtensionForLanguage,
  FILE_TYPE_FILTERS,
  fileNameHasExtension,
} from "./lib/fileTypes";
import {
  extensionFromPath,
  fileUrlToPath,
  fileNameFromPath,
  isPathWithin,
  joinPath,
  normalizeDialogPath,
  parentDirectory,
  pathEquals,
  resolveBasePath,
} from "./lib/paths";
import { stripJsonComments } from "./lib/jsonc";
import type {
  BrowserTarget,
  DirectoryListing,
  DirectorySearchMatch,
  FileContent,
  FileEntry,
  OpenDocument,
  ProjectSourceFile,
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
const TYPESCRIPT_IMPORT_DIAGNOSTICS_TO_IGNORE = [2307, 2792, 7016];
const MODIFIED_EXTERNALLY_PREFIX = "MODIFIED_EXTERNALLY:";
const SESSION_STORAGE_KEY = "code-notepad.session";

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
  editorStage: element<HTMLElement>("#editor-stage"),
  welcome: element<HTMLElement>("#welcome"),
  tabs: element<HTMLElement>("#tabs"),
  previewPanel: element<HTMLElement>("#preview-panel"),
  previewResizer: element<HTMLElement>("#preview-resizer"),
  previewFrame: element<HTMLIFrameElement>("#preview-frame"),
  previewEmpty: element<HTMLElement>("#preview-empty"),
  previewUrl: element<HTMLInputElement>("#preview-url"),
  previewForm: element<HTMLFormElement>("#preview-form"),
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
  editMenuTrigger: element<HTMLButtonElement>("#menu-edit-trigger"),
  editMenu: element<HTMLElement>("#menu-edit"),
  themeToggle: element<HTMLButtonElement>("#theme-toggle"),
  themeIcon: element<HTMLElement>("#theme-icon"),
  statusState: element<HTMLElement>("#status-state"),
  statusPath: element<HTMLElement>("#status-path"),
  statusPosition: element<HTMLElement>("#status-position"),
  languageSelect: element<HTMLSelectElement>("#language-select"),
  confirmDialog: element<HTMLDialogElement>("#confirm-dialog"),
  confirmTitle: element<HTMLElement>("#confirm-title"),
  confirmDescription: element<HTMLElement>("#confirm-description"),
  confirmCancel: element<HTMLButtonElement>("#confirm-cancel"),
  confirmReload: element<HTMLButtonElement>("#confirm-reload"),
  confirmAccept: element<HTMLButtonElement>("#confirm-accept"),
  editorContextMenu: element<HTMLElement>("#editor-context-menu"),
  explorerContextMenu: element<HTMLElement>("#explorer-context-menu"),
  tabsContextMenu: element<HTMLElement>("#tabs-context-menu"),
  promptDialog: element<HTMLDialogElement>("#prompt-dialog"),
  promptTitle: element<HTMLElement>("#prompt-title"),
  promptLabel: element<HTMLElement>("#prompt-label"),
  promptInput: element<HTMLInputElement>("#prompt-input"),
  promptCancel: element<HTMLButtonElement>("#prompt-cancel"),
  promptAccept: element<HTMLButtonElement>("#prompt-accept"),
  compareDialog: element<HTMLDialogElement>("#compare-dialog"),
  compareLeft: element<HTMLSelectElement>("#compare-left"),
  compareRight: element<HTMLSelectElement>("#compare-right"),
  diffContainer: element<HTMLElement>("#diff-container"),
  diffEditorHost: element<HTMLElement>("#diff-editor"),
  diffTitle: element<HTMLElement>("#diff-title"),
  autosaveToggle: element<HTMLButtonElement>("#autosave-toggle"),
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
  contextmenu: false,
  find: {
    seedSearchStringFromSelection: "always",
    autoFindInSelection: "never",
  },
});

if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  codeEditor.updateOptions({
    smoothScrolling: false,
    cursorSmoothCaretAnimation: "off",
    cursorBlinking: "solid",
  });
}

async function firstExistingPath(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    try {
      const listing = await invoke<DirectoryListing>("list_directory", {
        path: parentDirectory(candidate),
      });
      if (listing.entries.some((entry) => pathEquals(entry.path, candidate))) return candidate;
    } catch {
      // Parent illisible : essayer le candidat suivant.
    }
  }
  return null;
}

// Ctrl+clic sur une adresse détectée par Monaco : résoudre les chemins locaux
// (dossier du fichier actif, racine de session) et les ouvrir dans l'éditeur ;
// déléguer les liens http(s)/mailto au navigateur système. Sans cet ouvreur,
// Monaco tenterait de naviguer la webview elle-même et rien ne se passait.
monaco.editor.registerLinkOpener({
  open: async (uri) => {
    const raw = uri.toString(true);
    if (/^(https?|mailto):/i.test(raw)) {
      void openUrl(raw);
      return true;
    }
    let candidate = raw;
    try {
      candidate = decodeURIComponent(raw.replace(/^file:\/\//i, ""));
    } catch {
      // Séquence d'échappement invalide : utiliser la forme brute.
    }
    candidate = candidate.split(/[?#]/)[0];
    if (/^\/[a-zA-Z]:/.test(candidate)) candidate = candidate.slice(1);

    const candidates: string[] = [];
    if (/^[a-zA-Z]:[\\/]/.test(candidate) || candidate.startsWith("\\\\")) {
      candidates.push(candidate);
    } else {
      const relative = candidate.replace(/^\/+/, "");
      const activePath = activeDocument()?.path;
      if (activePath) candidates.push(joinPath(parentDirectory(activePath), relative));
      if (workspaceRoot) candidates.push(joinPath(workspaceRoot.path, relative));
    }
    const existing = await firstExistingPath(candidates);
    if (!existing) {
      showToast("Lien", `Fichier introuvable : ${candidate}`, "info");
      return true;
    }
    await openFilePath(existing);
    return true;
  },
});

const documents: OpenDocument[] = [];
let activeDocumentId: string | null = null;
let workspaceRoot: TreeNode | null = null;
let recents: RecentEntry[] = readRecents();
let activeTheme: Theme = readTheme();
let searchScope: SearchScope = "file";
let fileMatches: monaco.editor.FindMatch[] = [];
let activeMatchIndex = -1;
let folderSearchGeneration = 0;
let searchTimer: number | undefined;
let searchPanelPlaced = false;
let isComposingSearch = false;
let previewVisible = false;
let explorerVisible = true;
let browserTarget: BrowserTarget | null = null;
let remotePageLoaded = false;
let windowClosePending = false;
let untitledCounter = 1;
let sessionReady = false;
let autosaveEnabled = readAutosaveEnabled();
let interfaceZoom = 1;
let lastFolderMatches: DirectorySearchMatch[] = [];
let diffEditor: monaco.editor.IStandaloneDiffEditor | null = null;
let diffModels: { original: monaco.editor.ITextModel; modified: monaco.editor.ITextModel } | null = null;
let explorerMenuTarget: TreeNode | null = null;
let tabsMenuTargetId: string | null = null;
let projectSourceLibraries: monaco.IDisposable[] = [];
let projectContextGeneration = 0;
const autosaveTimers = new Map<string, number>();
const bufferTimers = new Map<string, number>();

const sharedTypeScriptOptions: monaco.languages.typescript.CompilerOptions = {
  allowJs: true,
  allowNonTsExtensions: true,
  checkJs: true,
  esModuleInterop: true,
  jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
  module: monaco.languages.typescript.ModuleKind.ESNext,
  moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
  resolveJsonModule: true,
  target: monaco.languages.typescript.ScriptTarget.ES2020,
};

for (const defaults of [
  monaco.languages.typescript.typescriptDefaults,
  monaco.languages.typescript.javascriptDefaults,
]) {
  defaults.setEagerModelSync(true);
  defaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    diagnosticCodesToIgnore: TYPESCRIPT_IMPORT_DIAGNOSTICS_TO_IGNORE,
  });
  defaults.setCompilerOptions(sharedTypeScriptOptions);
}

function activeDocument(): OpenDocument | undefined {
  return documents.find((document) => document.id === activeDocumentId);
}

function guessLanguageFromPath(path: string): string {
  const extension = `.${extensionFromPath(path)}`;
  for (const language of monaco.languages.getLanguages()) {
    if (language.extensions?.includes(extension)) return language.id;
  }
  return "plaintext";
}

async function readProjectCompilerOptions(root: string): Promise<monaco.languages.typescript.CompilerOptions> {
  for (const name of ["tsconfig.json", "jsconfig.json"]) {
    try {
      const content = await invoke<FileContent>("read_file", { path: joinPath(root, name) });
      const config = JSON.parse(stripJsonComments(content.contents)) as {
        compilerOptions?: { baseUrl?: unknown; paths?: unknown };
      };
      const configured = config.compilerOptions ?? {};
      const baseUrl = typeof configured.baseUrl === "string" ? configured.baseUrl : ".";
      const paths = configured.paths && typeof configured.paths === "object"
        ? configured.paths as Record<string, string[]>
        : undefined;
      return {
        ...sharedTypeScriptOptions,
        baseUrl: monaco.Uri.file(resolveBasePath(root, baseUrl)).toString(),
        paths,
      };
    } catch {
      // Try the other standard project configuration, then use safe defaults.
    }
  }
  return {
    ...sharedTypeScriptOptions,
    baseUrl: monaco.Uri.file(root).toString(),
    paths: { "@/*": ["*"] },
  };
}

function clearProjectLanguageContext(): void {
  projectContextGeneration += 1;
  projectSourceLibraries.forEach((library) => library.dispose());
  projectSourceLibraries = [];
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions(sharedTypeScriptOptions);
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions(sharedTypeScriptOptions);
}

async function refreshProjectLanguageContext(root: string): Promise<void> {
  const generation = ++projectContextGeneration;
  projectSourceLibraries.forEach((library) => library.dispose());
  projectSourceLibraries = [];
  try {
    const [sources, compilerOptions] = await Promise.all([
      invoke<ProjectSourceFile[]>("index_project_sources", { root }),
      readProjectCompilerOptions(root),
    ]);
    if (generation !== projectContextGeneration || !workspaceRoot || !pathEquals(workspaceRoot.path, root)) return;
    for (const defaults of [
      monaco.languages.typescript.typescriptDefaults,
      monaco.languages.typescript.javascriptDefaults,
    ]) defaults.setCompilerOptions(compilerOptions);
    projectSourceLibraries = sources.flatMap((source) => {
      const uri = monaco.Uri.file(source.path).toString();
      return [
        monaco.languages.typescript.typescriptDefaults.addExtraLib(source.contents, uri),
        monaco.languages.typescript.javascriptDefaults.addExtraLib(source.contents, uri),
      ];
    });
    renderStatus();
    if (sources.length > 0) {
      showToast("Imports reconnus", `${sources.length} sources locales indexées.`, "success");
    }
  } catch (error) {
    if (generation !== projectContextGeneration) return;
    renderStatus();
    showToast("Analyse du projet limitée", errorMessage(error), "info");
  }
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

async function confirmAction(title: string, description: string, acceptLabel: string): Promise<boolean> {
  // Un dialogue modal est déjà ouvert : refuser sans lever, sinon showModal()
  // provoquerait une InvalidStateError.
  if (dom.confirmDialog.open) return false;
  dom.confirmTitle.textContent = title;
  dom.confirmDescription.textContent = description;
  dom.confirmAccept.textContent = acceptLabel;
  dom.confirmReload.hidden = true;
  dom.confirmDialog.showModal();
  // showModal ne réinitialise pas returnValue : sans cette remise à zéro, une
  // fermeture par Échap hériterait du choix du dialogue précédent.
  dom.confirmDialog.returnValue = "";
  window.setTimeout(() => dom.confirmCancel.focus(), 0);
  return new Promise((resolve) => {
    dom.confirmDialog.addEventListener(
      "close",
      () => resolve(dom.confirmDialog.returnValue === "confirm"),
      { once: true },
    );
  });
}

type ExternalChangeChoice = "overwrite" | "reload" | "cancel";

function confirmExternalModification(documentRecord: OpenDocument): Promise<ExternalChangeChoice> {
  // Même garde de réentrance que confirmAction.
  if (dom.confirmDialog.open) return Promise.resolve("cancel");
  const reloadWarning = documentRecord.dirty
    ? " Vos modifications non enregistrées seront perdues."
    : "";
  dom.confirmTitle.textContent = "Fichier modifié en dehors de l’application";
  dom.confirmDescription.textContent =
    `« ${documentRecord.name} » a été modifié par une autre application depuis son ouverture. ` +
    "Écraser : remplace la version du disque par le contenu affiché. " +
    `Recharger : abandonne le contenu affiché et charge la version du disque.${reloadWarning}`;
  dom.confirmAccept.textContent = "Écraser le fichier";
  dom.confirmReload.hidden = false;
  dom.confirmDialog.showModal();
  dom.confirmDialog.returnValue = "";
  window.setTimeout(() => dom.confirmCancel.focus(), 0);
  return new Promise((resolve) => {
    dom.confirmDialog.addEventListener(
      "close",
      () => {
        const value = dom.confirmDialog.returnValue;
        resolve(value === "confirm" ? "overwrite" : value === "reload" ? "reload" : "cancel");
      },
      { once: true },
    );
  });
}

function confirmDiscard(description: string): Promise<boolean> {
  return confirmAction(
    "Modifications non enregistrées",
    description,
    "Fermer sans enregistrer",
  );
}

function watchDocument(documentRecord: OpenDocument): monaco.IDisposable {
  return documentRecord.model.onDidChangeContent(() => {
    if (documentRecord.suppressDirty) return;
    if (!documentRecord.dirty) {
      documentRecord.dirty = true;
      renderTabs();
      renderStatus();
      void updateWindowTitle();
    }
    scheduleBufferSave(documentRecord);
    scheduleAutosave(documentRecord);
  });
}

const AUTOSAVE_DELAY_MS = 1500;
const BUFFER_DELAY_MS = 800;
const MAX_BUFFER_CHARS = 400_000;

function documentBufferKey(documentRecord: OpenDocument): string {
  return documentRecord.path ?? `untitled:${documentRecord.id}`;
}

// Tampon anti-crash : le contenu non enregistré est conservé dans le
// localStorage et repris au prochain démarrage.
function scheduleBufferSave(documentRecord: OpenDocument): void {
  window.clearTimeout(bufferTimers.get(documentRecord.id));
  bufferTimers.set(
    documentRecord.id,
    window.setTimeout(() => {
      bufferTimers.delete(documentRecord.id);
      if (!documents.includes(documentRecord) || !documentRecord.dirty) return;
      const contents = documentRecord.model.getValue();
      if (contents.length > MAX_BUFFER_CHARS) return;
      saveBuffer(documentBufferKey(documentRecord), {
        path: documentRecord.path,
        name: documentRecord.name,
        language: documentRecord.language,
        contents,
        modifiedAt: Date.now(),
      });
    }, BUFFER_DELAY_MS),
  );
}

function scheduleAutosave(documentRecord: OpenDocument): void {
  // Conflit externe non résolu : ne pas réécrire par-dessus la version du
  // disque en boucle — l'utilisateur tranche via Enregistrer (écraser/recharger).
  if (!autosaveEnabled || !documentRecord.path || documentRecord.externalConflict) return;
  window.clearTimeout(autosaveTimers.get(documentRecord.id));
  autosaveTimers.set(
    documentRecord.id,
    window.setTimeout(() => {
      autosaveTimers.delete(documentRecord.id);
      if (!documents.includes(documentRecord) || !documentRecord.dirty || !documentRecord.path) return;
      void persistDocument(documentRecord, documentRecord.path, documentRecord.modified, true);
    }, AUTOSAVE_DELAY_MS),
  );
}

function clearDocumentTracking(documentRecord: OpenDocument): void {
  window.clearTimeout(autosaveTimers.get(documentRecord.id));
  autosaveTimers.delete(documentRecord.id);
  window.clearTimeout(bufferTimers.get(documentRecord.id));
  bufferTimers.delete(documentRecord.id);
  clearBuffer(documentBufferKey(documentRecord));
}

function setAutosaveEnabled(enabled: boolean): void {
  autosaveEnabled = enabled;
  saveAutosaveEnabled(enabled);
  dom.autosaveToggle.setAttribute("aria-checked", String(enabled));
  showToast(
    "Enregistrement automatique",
    enabled ? "Activé : les fichiers enregistrés sont sauvegardés 1,5 s après la dernière frappe." : "Désactivé.",
    "info",
  );
  if (enabled) {
    for (const documentRecord of documents) {
      if (documentRecord.dirty) scheduleAutosave(documentRecord);
    }
    return;
  }
  for (const timer of autosaveTimers.values()) window.clearTimeout(timer);
  autosaveTimers.clear();
}

const noopDisposable: monaco.IDisposable = { dispose() {} };

function createDocument(
  name: string,
  path: string | null,
  contents: string,
  language: string,
  modified = 0,
): OpenDocument {
  const uri = path
    ? monaco.Uri.file(path)
    : monaco.Uri.parse(`untitled:///Nouveau-${untitledCounter}`);
  const model = monaco.editor.createModel(contents, language, uri);
  // L'écouteur est rattaché juste après la création : aucune édition ne peut
  // intervenir dans ce même tour synchrone.
  const documentRecord: OpenDocument = {
    id: crypto.randomUUID(),
    name,
    path,
    language,
    model,
    dirty: false,
    suppressDirty: false,
    externalConflict: false,
    modified,
    disposeChangeListener: noopDisposable,
  };
  documentRecord.disposeChangeListener = watchDocument(documentRecord);
  return documentRecord;
}

function renameDocumentModel(documentRecord: OpenDocument, newPath: string): void {
  const wasActive = documentRecord.id === activeDocumentId;
  const viewState = wasActive ? codeEditor.saveViewState() : null;
  const replacement = monaco.editor.createModel(
    documentRecord.model.getValue(),
    documentRecord.language,
    monaco.Uri.file(newPath),
  );
  if (wasActive) {
    codeEditor.setModel(replacement);
    if (viewState) codeEditor.restoreViewState(viewState);
  }
  documentRecord.disposeChangeListener.dispose();
  documentRecord.model.dispose();
  documentRecord.model = replacement;
  documentRecord.disposeChangeListener = watchDocument(documentRecord);
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
    wrapper.dataset.documentId = documentRecord.id;

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
      let nextIndex: number;
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
  if (sessionReady) saveSessionSnapshot();
}

function buildSessionSnapshot(): SessionSnapshotData {
  return {
    workspace: workspaceRoot?.path ?? null,
    paths: documents.filter((document) => document.path).map((document) => document.path as string),
    activePath: activeDocument()?.path ?? null,
  };
}

function saveSessionSnapshot(): void {
  const snapshot = buildSessionSnapshot();
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Stockage de session indisponible : la restauration après rechargement
    // ne sera simplement pas possible.
  }
  rememberLastSession(snapshot);
}

async function restoreFromSnapshot(snapshot: SessionSnapshotData, silent: boolean): Promise<void> {
  let restored = 0;
  if (snapshot.workspace) {
    await openFolderPath(normalizeDialogPath(snapshot.workspace), true);
  }
  for (const path of snapshot.paths) {
    const before = documents.length;
    await openFilePath(normalizeDialogPath(path), undefined, undefined, true);
    if (documents.length > before) restored += 1;
  }
  const activePath = snapshot.activePath ? normalizeDialogPath(snapshot.activePath) : null;
  const activeDoc = activePath
    ? documents.find((document) => document.path && pathEquals(document.path, activePath))
    : undefined;
  if (activeDoc) switchDocument(activeDoc.id);
  if (!silent && restored > 0) {
    showToast(
      "Session restaurée",
      snapshot.workspace
        ? `${restored} fichier${restored > 1 ? "s" : ""} et le dossier ont été rouverts.`
        : `${restored} fichier${restored > 1 ? "s" : ""} de la session précédente ont été rouverts.`,
      "info",
    );
  }
}

async function recoverUnsavedBuffers(): Promise<void> {
  const buffers = readBuffers();
  let recovered = 0;
  for (const [key, entry] of Object.entries(buffers)) {
    clearBuffer(key);
    if (!entry.contents) continue;
    if (entry.path) {
      let documentRecord = documents.find(
        (candidate) => candidate.path && pathEquals(candidate.path, entry.path as string),
      );
      if (!documentRecord) {
        await openFilePath(entry.path, undefined, undefined, true);
        documentRecord = documents.find(
          (candidate) => candidate.path && pathEquals(candidate.path, entry.path as string),
        );
      }
      if (documentRecord && documentRecord.model.getValue() !== entry.contents) {
        documentRecord.suppressDirty = true;
        documentRecord.model.setValue(entry.contents);
        documentRecord.suppressDirty = false;
        documentRecord.dirty = true;
        recovered += 1;
      }
    } else {
      documents.push(createDocument(entry.name, null, entry.contents, entry.language));
      recovered += 1;
    }
  }
  if (recovered > 0) {
    refreshChrome();
    showToast(
      "Récupération",
      `${recovered} tampon${recovered > 1 ? "s" : ""} de modifications non enregistrées restauré${recovered > 1 ? "s" : ""}.`,
      "info",
    );
  }
}

async function restoreSessionAfterReload(): Promise<void> {
  let snapshot: SessionSnapshotData | null = null;
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    if (raw) snapshot = JSON.parse(raw) as SessionSnapshotData;
  } catch {
    snapshot = null;
  }
  if (snapshot?.paths?.length || snapshot?.workspace) {
    // Rechargement de la page (Vite, crash webview) : restauration silencieuse
    // complète, dossier compris.
    await restoreFromSnapshot(snapshot, true);
  } else {
    // Lancement : les fichiers de la session précédente sont rouverts
    // automatiquement, sans dialogue ni dossier de projet.
    const last = readLastSession();
    if (last && last.paths.length > 0) {
      await restoreFromSnapshot({ workspace: null, paths: last.paths, activePath: last.activePath }, false);
    }
  }
  await recoverUnsavedBuffers();
  sessionReady = true;
  saveSessionSnapshot();
}

async function handleLaunchFiles(paths: string[]): Promise<void> {
  for (const path of paths) {
    await openFilePath(normalizeDialogPath(path));
  }
  void appWindow?.setFocus().catch(() => {
    // Focus indisponible : l'ouverture des fichiers reste le comportement clé.
  });
}

async function openFilesFromWindows(): Promise<void> {
  if (!isNativeApp) return;
  try {
    const paths = await invoke<string[]>("get_launch_files");
    await handleLaunchFiles(paths);
  } catch (error) {
    showToast("Ouverture Windows impossible", errorMessage(error), "error");
  }
}

async function initializeSession(): Promise<void> {
  await restoreSessionAfterReload();
  await openFilesFromWindows();
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
    filters: FILE_TYPE_FILTERS,
  });
  if (!selected || Array.isArray(selected)) return;
  await openFilePath(normalizeDialogPath(selected));
}

async function openFilePath(
  path: string,
  line?: number,
  column?: number,
  silent = false,
): Promise<void> {
  const normalizedPath = normalizeDialogPath(path);
  const existing = documents.find((document) => document.path && pathEquals(document.path, normalizedPath));
  if (existing) {
    switchDocument(existing.id, line, column);
    return;
  }

  try {
    dom.statusState.textContent = "Ouverture…";
    const content = await invoke<FileContent>("read_file", { path: normalizedPath });
    const language = guessLanguageFromPath(normalizedPath);
    const documentRecord = createDocument(
      fileNameFromPath(normalizedPath),
      normalizedPath,
      content.contents,
      language,
      content.modified,
    );
    documents.push(documentRecord);
    recents = rememberRecent("file", normalizedPath, documentRecord.name);
    switchDocument(documentRecord.id, line, column);
    if (HTML_EXTENSIONS.has(extensionFromPath(normalizedPath))) {
      setPreviewVisible(true);
      await refreshPreview(false);
    }
  } catch (error) {
    recents = removeRecent(normalizedPath);
    refreshChrome();
    if (!silent) {
      showToast("Fichier non ouvert", `${fileNameFromPath(normalizedPath)} : ${errorMessage(error)}`, "error");
    }
  }
}

let projectContextRefreshTimer: number | undefined;

function scheduleProjectContextRefresh(path: string): void {
  if (!workspaceRoot || !isPathWithin(path, workspaceRoot.path)) return;
  window.clearTimeout(projectContextRefreshTimer);
  projectContextRefreshTimer = window.setTimeout(() => {
    if (workspaceRoot) void refreshProjectLanguageContext(workspaceRoot.path);
  }, 1500);
}

// Recharge le contenu du disque dans l'éditeur : via pushEditOperations plutôt
// que setValue pour que l'annulation (Ctrl+Z) rende accessible la version
// écartée de l'utilisateur.
async function reloadDocument(documentRecord: OpenDocument): Promise<void> {
  if (!documentRecord.path) return;
  try {
    const content = await invoke<FileContent>("read_file", { path: documentRecord.path });
    const model = documentRecord.model;
    const viewState = documentRecord.id === activeDocumentId ? codeEditor.saveViewState() : null;
    documentRecord.suppressDirty = true;
    model.pushEditOperations(
      [],
      [{ range: model.getFullModelRange(), text: content.contents }],
      () => null,
    );
    documentRecord.suppressDirty = false;
    documentRecord.modified = content.modified;
    documentRecord.dirty = false;
    documentRecord.externalConflict = false;
    clearDocumentTracking(documentRecord);
    if (viewState) codeEditor.restoreViewState(viewState);
    refreshChrome();
    showToast("Fichier rechargé", `${documentRecord.name} : la version du disque a été chargée.`, "success");
  } catch (error) {
    renderStatus();
    showToast("Rechargement impossible", `${documentRecord.name} : ${errorMessage(error)}`, "error");
  }
}

async function persistDocument(
  documentRecord: OpenDocument,
  target: string,
  expectedModified: number,
  silent = false,
): Promise<boolean> {
  const isNewTarget = !documentRecord.path || !pathEquals(documentRecord.path, target);
  const previousBufferKey = documentBufferKey(documentRecord);
  try {
    const modified = await invoke<number>("write_file", {
      path: target,
      contents: documentRecord.model.getValue(),
      expectedModified,
    });
    if (isNewTarget) renameDocumentModel(documentRecord, target);
    documentRecord.path = target;
    documentRecord.name = fileNameFromPath(target);
    documentRecord.language = guessLanguageFromPath(target);
    monaco.editor.setModelLanguage(documentRecord.model, documentRecord.language);
    documentRecord.modified = modified;
    documentRecord.dirty = false;
    documentRecord.externalConflict = false;
    clearBuffer(previousBufferKey);
    clearBuffer(documentBufferKey(documentRecord));
    recents = rememberRecent("file", target, documentRecord.name);
    refreshChrome();
    if (!silent) showToast("Enregistré", documentRecord.name, "success");
    scheduleProjectContextRefresh(target);
    return true;
  } catch (error) {
    const message = errorMessage(error);
    if (message.startsWith(MODIFIED_EXTERNALLY_PREFIX)) {
      // L'autosave ne doit jamais interrompre la frappe avec une modale : il
      // suspend l'enregistrement du document et signale une seule fois.
      if (silent) {
        const wasNew = !documentRecord.externalConflict;
        documentRecord.externalConflict = true;
        renderStatus();
        if (wasNew) {
          showToast(
            "Fichier modifié en dehors de l’application",
            `« ${documentRecord.name} » a changé sur le disque. Enregistrement automatique suspendu : utilisez Enregistrer pour choisir entre écraser et recharger.`,
            "error",
          );
        }
        return false;
      }
      const choice = await confirmExternalModification(documentRecord);
      if (choice === "reload") {
        await reloadDocument(documentRecord);
        return false;
      }
      if (choice === "overwrite") return persistDocument(documentRecord, target, 0, silent);
      renderStatus();
      return false;
    }
    renderStatus();
    showToast("Enregistrement impossible", `${documentRecord.name} : ${message}`, "error");
    return false;
  }
}

async function saveDocument(documentRecord = activeDocument(), saveAs = false): Promise<boolean> {
  if (!documentRecord) return false;
  let target = documentRecord.path;
  let expectedModified = documentRecord.modified;
  if (!target || saveAs) {
    const selected = await save({
      defaultPath: target ?? `${documentRecord.name}${defaultExtensionForLanguage(documentRecord.language)}`,
      filters: FILE_TYPE_FILTERS,
    });
    if (!selected) return false;
    const chosen = normalizeDialogPath(selected);
    // Un document sans nom enregistré sans extension reçoit celle de son
    // langage (« Nouveau-1 » → « Nouveau-1.txt ») pour éviter les fichiers
    // sans type ; un nom déjà typé est respecté tel quel.
    target = !documentRecord.path && !fileNameHasExtension(chosen)
      ? `${chosen}${defaultExtensionForLanguage(documentRecord.language)}`
      : chosen;
    if (!documentRecord.path || !pathEquals(documentRecord.path, chosen)) {
      const occupant = documents.find(
        (document) => document !== documentRecord && document.path && pathEquals(document.path, chosen),
      );
      if (occupant) {
        showToast(
          "Enregistrement impossible",
          `« ${occupant.name} » est déjà ouvert dans un autre onglet.`,
          "error",
        );
        return false;
      }
    }
    // Nouvelle destination : pas de contrôle de fraîcheur à opposer.
    expectedModified = 0;
  }
  dom.statusState.textContent = "Enregistrement…";
  return persistDocument(documentRecord, target, expectedModified);
}

function disposeDocument(documentRecord: OpenDocument): void {
  clearDocumentTracking(documentRecord);
  if (diffModels && (diffModels.original === documentRecord.model || diffModels.modified === documentRecord.model)) {
    closeComparison();
  }
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

// Actions groupées du menu contextuel des onglets : chaque étape passe par
// closeDocument / saveDocument (confirmations incluses) ; un refus de
// l'utilisateur interrompt le reste du lot.
async function saveAllDocuments(): Promise<void> {
  for (const documentRecord of [...documents]) {
    if (!documentRecord.dirty) continue;
    if (!(await saveDocument(documentRecord))) return;
  }
}

async function closeOtherDocuments(keepId: string): Promise<void> {
  for (const documentRecord of [...documents]) {
    if (documentRecord.id === keepId) continue;
    if (!(await closeDocument(documentRecord.id))) return;
  }
}

async function closeAllDocuments(): Promise<void> {
  for (const documentRecord of [...documents]) {
    if (!(await closeDocument(documentRecord.id))) return;
  }
}

async function openFolder(): Promise<void> {
  const selected = await open({ directory: true, multiple: false });
  if (!selected || Array.isArray(selected)) return;
  await openFolderPath(normalizeDialogPath(selected));
}

async function openFolderPath(path: string, silent = false): Promise<void> {
  const normalizedPath = normalizeDialogPath(path);
  if (workspaceRoot && pathEquals(workspaceRoot.path, normalizedPath)) return;
  if (workspaceRoot && !(await closeWorkspace(true))) return;

  try {
    dom.statusState.textContent = "Lecture du dossier…";
    const listing = await invoke<DirectoryListing>("list_directory", { path: normalizedPath });
    workspaceRoot = {
      name: fileNameFromPath(normalizedPath),
      path: normalizedPath,
      isDirectory: true,
      isSymlink: false,
      expanded: true,
      children: listing.entries.map(toTreeNode),
      truncated: listing.truncated,
    };
    recents = rememberRecent("folder", normalizedPath, workspaceRoot.name);
    refreshChrome();
    if (!silent) showToast("Dossier ouvert", workspaceRoot.name, "success");
    void refreshProjectLanguageContext(normalizedPath);
  } catch (error) {
    recents = removeRecent(normalizedPath);
    workspaceRoot = null;
    refreshChrome();
    if (!silent) {
      showToast("Dossier non ouvert", `${fileNameFromPath(normalizedPath)} : ${errorMessage(error)}`, "error");
    }
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
      const listing = await invoke<DirectoryListing>("list_directory", { path: node.path });
      node.children = listing.entries.map(toTreeNode);
      node.truncated = listing.truncated;
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
    row.dataset.path = node.path;
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
      if (node.truncated) {
        const notice = document.createElement("li");
        notice.className = "tree-truncated";
        notice.textContent = `Liste tronquée : ${node.children.length} premiers éléments affichés.`;
        children.append(notice);
      }
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
  clearProjectLanguageContext();
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
  dom.editMenu.hidden = true;
  dom.recentMenu.hidden = true;
  dom.editorContextMenu.hidden = true;
  dom.explorerContextMenu.hidden = true;
  dom.tabsContextMenu.hidden = true;
  dom.fileMenuTrigger.setAttribute("aria-expanded", "false");
  dom.editMenuTrigger.setAttribute("aria-expanded", "false");
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
  if (!visible && browserTarget?.kind === "remote") {
    // Fermer le navigateur arrête la page distante (scripts, téléchargements).
    dom.previewFrame.removeAttribute("src");
    remotePageLoaded = false;
  }
  window.setTimeout(() => codeEditor.layout(), 0);
  updatePreviewAvailability();
}

function updatePreviewAvailability(): void {
  const remoteShown = browserTarget?.kind === "remote";
  dom.previewRoute.classList.toggle(
    "is-active",
    previewVisible && (isHtmlDocument() || remoteShown),
  );
  if (!previewVisible) return;
  if (!isHtmlDocument() && !remoteShown) {
    dom.previewFrame.hidden = true;
    dom.previewFrame.removeAttribute("src");
    remotePageLoaded = false;
    dom.previewEmpty.hidden = false;
    dom.previewUrl.value = "";
  }
}

function addressForBrowserTarget(): string {
  if (!browserTarget) return "";
  return browserTarget.kind === "remote" ? browserTarget.url : browserTarget.path;
}

const LOCAL_ADDRESS_PATTERN = new RegExp(
  [
    "localhost(?::\\d{1,5})?(?:/[^\\s]*)?",
    "127(?:\\.\\d{1,3}){3}(?::\\d{1,5})?(?:/[^\\s]*)?",
    "192\\.168(?:\\.\\d{1,3}){2}(?::\\d{1,5})?(?:/[^\\s]*)?",
    "10(?:\\.\\d{1,3}){3}(?::\\d{1,5})?(?:/[^\\s]*)?",
    "172\\.(?:1[6-9]|2\\d|3[01])(?:\\.\\d{1,3}){2}(?::\\d{1,5})?(?:/[^\\s]*)?",
    "\\[::1\\](?::\\d{1,5})?(?:/[^\\s]*)?",
    "[a-z0-9-]+\\.localhost(?::\\d{1,5})?(?:/[^\\s]*)?",
  ].join("|"),
  "i",
);
const DOMAIN_ADDRESS_PATTERN = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d{1,5})?(?:\/[^\s]*)?$/i;

function relativeBaseDirectory(): string | null {
  if (workspaceRoot) return workspaceRoot.path;
  const currentPath = activeDocument()?.path;
  return currentPath ? parentDirectory(currentPath) : null;
}

async function showRemotePage(url: string): Promise<void> {
  setPreviewVisible(true);
  browserTarget = { kind: "remote", url };
  try {
    // Libère le dossier servi par le protocole local : une page distante ne doit
    // pas pouvoir relire les fichiers de l'aperçu via codenotepad.localhost.
    await invoke("clear_preview");
  } catch {
    // Sans libération, la navigation distante reste prioritaire ; l'état local
    // sera rétabli au prochain aperçu de fichier.
  }
  dom.previewFrame.hidden = false;
  dom.previewEmpty.hidden = true;
  dom.previewFrame.src = url;
  dom.previewUrl.value = url;
  remotePageLoaded = true;
  dom.previewRoute.classList.add("is-active");
}

async function resolveAmbiguousAddress(value: string): Promise<BrowserTarget> {
  // « exemple.com » désigne le plus souvent un domaine, mais peut être un
  // fichier local homonyme du dossier ouvert : le dossier tranche.
  const base = relativeBaseDirectory();
  if (base) {
    try {
      const listing = await invoke<DirectoryListing>("list_directory", { path: base });
      const candidate = joinPath(base, value);
      if (listing.entries.some((entry) => pathEquals(entry.path, candidate))) {
        return { kind: "local", path: candidate };
      }
    } catch {
      // Dossier illisible : considérer l'adresse comme distante.
    }
  }
  return { kind: "remote", url: `https://${value}` };
}

async function navigateBrowser(raw: string): Promise<void> {
  const value = raw.trim();
  if (!value) return;
  if (/^https?:\/\//i.test(value)) {
    await showRemotePage(value);
    return;
  }
  const fileUrl = /^file:\/\//i.test(value) ? fileUrlToPath(value) : null;
  if (fileUrl) {
    await openFilePath(fileUrl);
    return;
  }
  if (/^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("\\\\") || value.startsWith("/")) {
    await openFilePath(value);
    return;
  }
  if (LOCAL_ADDRESS_PATTERN.test(value)) {
    await showRemotePage(`http://${value}`);
    return;
  }
  if (DOMAIN_ADDRESS_PATTERN.test(value)) {
    const target = await resolveAmbiguousAddress(value);
    if (target.kind === "local") await openFilePath(target.path);
    else await showRemotePage(target.url);
    return;
  }
  const base = relativeBaseDirectory();
  if (!base) {
    showToast("Adresse incomplète", "Indiquez un chemin absolu ou une adresse http(s).", "info");
    return;
  }
  await openFilePath(joinPath(base, value));
}

async function refreshPreview(saveBefore: boolean): Promise<void> {
  const current = activeDocument();
  if (!isHtmlDocument(current)) {
    if (browserTarget?.kind === "remote" && !remotePageLoaded) await showRemotePage(browserTarget.url);
    else updatePreviewAvailability();
    return;
  }
  if (saveBefore && current.dirty && !(await saveDocument(current))) return;

  try {
    const prepared = await invoke<string>("prepare_preview", {
      path: current.path,
      workspaceRoot: workspaceRoot?.path ?? null,
    });
    browserTarget = { kind: "local", path: current.path };
    remotePageLoaded = false;
    const separator = prepared.includes("?") ? "&" : "?";
    dom.previewFrame.src = `${prepared}${separator}refresh=${Date.now()}`;
    dom.previewFrame.hidden = false;
    dom.previewEmpty.hidden = true;
    dom.previewUrl.value = current.path;
    dom.previewRoute.classList.add("is-active");
  } catch (error) {
    dom.previewFrame.hidden = true;
    dom.previewEmpty.hidden = false;
    dom.previewUrl.value = addressForBrowserTarget();
    showToast("Aperçu impossible", errorMessage(error), "error");
  }
}

async function writeClipboardText(text: string): Promise<boolean> {
  if (!text) return true;
  try {
    if (isNativeApp) {
      await writeText(text);
      return true;
    }
  } catch {
    // Repli sur le presse-papiers du navigateur (mode développement).
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

async function readClipboardText(): Promise<string | null> {
  try {
    if (isNativeApp) return await readText();
  } catch {
    // Repli sur le presse-papiers du navigateur (mode développement).
  }
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

async function copySelectionToClipboard(cut: boolean): Promise<void> {
  if (!activeDocument()) return;
  const selection = codeEditor.getSelection();
  const model = codeEditor.getModel();
  if (!selection || !model || selection.isEmpty()) return;
  const text = model.getValueInRange(selection);
  if (!(await writeClipboardText(text))) {
    showToast("Presse-papiers indisponible", "L’autorisation de lecture du presse-papiers a été refusée.", "error");
    return;
  }
  if (cut) {
    codeEditor.executeEdits("menu-edit", [{ range: selection, text: "", forceMoveMarkers: true }]);
  }
}

async function pasteFromClipboard(): Promise<void> {
  if (!activeDocument()) return;
  const text = await readClipboardText();
  if (text === null) {
    showToast("Presse-papiers indisponible", "L’autorisation de lecture du presse-papiers a été refusée.", "error");
    return;
  }
  if (!text) return;
  codeEditor.focus();
  const selection = codeEditor.getSelection();
  if (!selection) return;
  codeEditor.executeEdits("menu-edit", [{ range: selection, text, forceMoveMarkers: true }]);
}

function selectAllInEditor(): void {
  const model = codeEditor.getModel();
  if (!model) return;
  codeEditor.setSelection(model.getFullModelRange());
  codeEditor.focus();
}

function runEditorCommand(command: string): void {
  if (!activeDocument()) return;
  codeEditor.focus();
  codeEditor.trigger("menu-edit", command, null);
}

function openReplacePanel(): void {
  openSearchPanel();
  dom.replaceValue.focus();
}

function openCompareDialog(): void {
  if (dom.compareDialog.open || dom.confirmDialog.open || dom.promptDialog.open) return;
  if (documents.length < 2) {
    showToast("Comparer", "Ouvrez au moins deux fichiers pour les comparer.", "info");
    return;
  }
  const labelFor = (documentRecord: OpenDocument): string =>
    `${documentRecord.name}${documentRecord.path ? ` — ${documentRecord.path}` : " (non enregistré)"}`;
  for (const select of [dom.compareLeft, dom.compareRight]) {
    select.replaceChildren();
    for (const documentRecord of documents) {
      const option = document.createElement("option");
      option.value = documentRecord.id;
      option.textContent = labelFor(documentRecord);
      select.append(option);
    }
  }
  const activeIndex = Math.max(
    0,
    documents.findIndex((documentRecord) => documentRecord.id === activeDocumentId),
  );
  dom.compareLeft.selectedIndex = activeIndex;
  dom.compareRight.selectedIndex = documents.length > 1 ? (activeIndex + 1) % documents.length : 0;
  dom.compareDialog.showModal();
}

// La comparaison utilise les modèles vivants : les retouches faites dans
// l'éditeur se reflètent en direct, en lecture seule.
function openComparison(): void {
  const left = documents.find((documentRecord) => documentRecord.id === dom.compareLeft.value);
  const right = documents.find((documentRecord) => documentRecord.id === dom.compareRight.value);
  if (!left || !right) return;
  if (left.id === right.id) {
    showToast("Comparer", "Sélectionnez deux fichiers différents.", "info");
    return;
  }
  diffEditor?.dispose();
  dom.diffContainer.hidden = false;
  dom.welcome.hidden = true;
  diffEditor = monaco.editor.createDiffEditor(dom.diffEditorHost, {
    readOnly: true,
    originalEditable: false,
    automaticLayout: true,
    renderSideBySide: true,
    fontSize: 13,
    lineHeight: 22,
    fontFamily: "JetBrains Mono, Cascadia Code, Consolas, monospace",
    scrollBeyondLastLine: false,
  });
  diffModels = { original: left.model, modified: right.model };
  diffEditor.setModel({ original: left.model, modified: right.model });
  dom.diffTitle.textContent = `${left.name} ↔ ${right.name}`;
}

function closeComparison(): void {
  diffEditor?.dispose();
  diffEditor = null;
  diffModels = null;
  dom.diffContainer.hidden = true;
  refreshChrome();
}

function isValidEntryName(name: string): boolean {
  return name.length > 0 && !/[\\/:*?"<>|]/.test(name) && !/[. ]$/.test(name);
}

function promptText(title: string, label: string, value: string): Promise<string | null> {
  if (dom.promptDialog.open || dom.confirmDialog.open || dom.compareDialog.open) {
    return Promise.resolve(null);
  }
  dom.promptTitle.textContent = title;
  dom.promptLabel.textContent = label;
  dom.promptInput.value = value;
  dom.promptDialog.showModal();
  window.setTimeout(() => {
    dom.promptInput.focus();
    const dot = value.lastIndexOf(".");
    dom.promptInput.setSelectionRange(0, dot > 0 ? dot : value.length);
  }, 0);
  return new Promise((resolve) => {
    dom.promptDialog.addEventListener(
      "close",
      () => resolve(dom.promptDialog.returnValue === "confirm" ? dom.promptInput.value.trim() : null),
      { once: true },
    );
  });
}

function findTreeNode(node: TreeNode, path: string): TreeNode | null {
  if (pathEquals(node.path, path)) return node;
  for (const child of node.children ?? []) {
    const found = findTreeNode(child, path);
    if (found) return found;
  }
  return null;
}

function findParentNode(node: TreeNode, path: string): TreeNode | null {
  for (const child of node.children ?? []) {
    if (pathEquals(child.path, path)) return node;
    const found = findParentNode(child, path);
    if (found) return found;
  }
  return null;
}

async function refreshNodeChildren(node: TreeNode): Promise<void> {
  if (!node.isDirectory) return;
  try {
    const listing = await invoke<DirectoryListing>("list_directory", { path: node.path });
    node.children = listing.entries.map(toTreeNode);
    node.truncated = listing.truncated;
  } catch (error) {
    showToast("Dossier illisible", `${node.name} : ${errorMessage(error)}`, "error");
  }
  renderExplorer();
}

async function createExplorerEntry(directoryNode: TreeNode, kind: "file" | "folder"): Promise<void> {
  const title = kind === "file" ? "Nouveau fichier" : "Nouveau dossier";
  const name = await promptText(title, "Nom", kind === "file" ? "nouveau.txt" : "nouveau-dossier");
  if (!name) return;
  if (!isValidEntryName(name)) {
    showToast(title, "Ce nom est invalide ou contient des caractères interdits : \\ / : * ? \" < > |", "error");
    return;
  }
  const target = joinPath(directoryNode.path, name);
  try {
    if (kind === "file") await invoke("create_file", { path: target, contents: "" });
    else await invoke("create_directory", { path: target });
    await refreshNodeChildren(directoryNode);
    if (kind === "file") await openFilePath(target);
    showToast(title, name, "success");
    scheduleProjectContextRefresh(target);
  } catch (error) {
    showToast(title, errorMessage(error), "error");
  }
}

// Répercute un renommage/déplacement de l'explorateur sur les documents ouverts
// du sous-arbre (modèles relocalisés, tampons nettoyés).
async function remapDocumentsUnder(previousPath: string, targetPath: string): Promise<void> {
  for (const documentRecord of [...documents]) {
    if (!documentRecord.path || !isPathWithin(documentRecord.path, previousPath)) continue;
    const nextPath = `${targetPath}${documentRecord.path.slice(previousPath.length)}`;
    if (
      documents.some(
        (candidate) => candidate !== documentRecord && candidate.path && pathEquals(candidate.path, nextPath),
      )
    ) {
      continue;
    }
    const isDirect = pathEquals(documentRecord.path, previousPath);
    const previousKey = documentBufferKey(documentRecord);
    renameDocumentModel(documentRecord, nextPath);
    documentRecord.path = nextPath;
    documentRecord.name = fileNameFromPath(nextPath);
    documentRecord.language = guessLanguageFromPath(nextPath);
    monaco.editor.setModelLanguage(documentRecord.model, documentRecord.language);
    clearBuffer(previousKey);
    if (isDirect) {
      try {
        const content = await invoke<FileContent>("read_file", { path: nextPath });
        documentRecord.modified = content.modified;
        recents = removeRecent(previousPath);
        recents = rememberRecent("file", nextPath, documentRecord.name);
      } catch {
        documentRecord.modified = 0;
      }
    }
  }
  refreshChrome();
}

async function renameExplorerNode(node: TreeNode): Promise<void> {
  const name = await promptText("Renommer", "Nouveau nom", node.name);
  if (!name || name === node.name) return;
  if (!isValidEntryName(name)) {
    showToast("Renommer", "Ce nom est invalide ou contient des caractères interdits : \\ / : * ? \" < > |", "error");
    return;
  }
  const previousPath = node.path;
  const target = joinPath(parentDirectory(previousPath), name);
  if (documents.some((candidate) => candidate.path && pathEquals(candidate.path, target))) {
    showToast("Renommage impossible", "Un fichier du même nom est déjà ouvert dans un onglet.", "error");
    return;
  }
  try {
    await invoke("rename_file", { source: previousPath, target });
    await remapDocumentsUnder(previousPath, target);
    const parent = workspaceRoot ? findParentNode(workspaceRoot, previousPath) : null;
    const listingRoot = parent ?? workspaceRoot;
    if (listingRoot) await refreshNodeChildren(listingRoot);
    showToast("Renommé", `${fileNameFromPath(previousPath)} → ${name}`, "success");
    scheduleProjectContextRefresh(target);
  } catch (error) {
    showToast("Renommage impossible", errorMessage(error), "error");
  }
}

async function deleteExplorerNode(node: TreeNode): Promise<void> {
  const confirmed = await confirmAction(
    "Supprimer",
    `Supprimer « ${node.name} » ? ${node.isDirectory ? "Le dossier et tout son contenu seront déplacés vers la corbeille." : "Le fichier sera déplacé vers la corbeille."}`,
    "Supprimer",
  );
  if (!confirmed) return;
  const affected = documents.filter(
    (documentRecord) =>
      documentRecord.path &&
      (pathEquals(documentRecord.path, node.path) || isPathWithin(documentRecord.path, node.path)),
  );
  for (const documentRecord of affected) {
    await closeDocument(documentRecord.id, true);
  }
  try {
    await invoke("delete_to_trash", { path: node.path });
    for (const documentRecord of affected) {
      if (documentRecord.path) recents = removeRecent(documentRecord.path);
    }
    const parent = workspaceRoot ? findParentNode(workspaceRoot, node.path) : null;
    if (parent) await refreshNodeChildren(parent);
    else renderExplorer();
    showToast("Supprimé", node.name, "success");
    if (workspaceRoot) scheduleProjectContextRefresh(workspaceRoot.path);
  } catch (error) {
    showToast("Suppression impossible", errorMessage(error), "error");
  }
}

function openExplorerContextMenu(x: number, y: number, target: TreeNode | null): void {
  closeMenus();
  explorerMenuTarget = target;
  const atRoot = target !== null && workspaceRoot !== null && pathEquals(target.path, workspaceRoot.path);
  const directoryTarget = target
    ? target.isDirectory
      ? target
      : ((workspaceRoot ? findParentNode(workspaceRoot, target.path) : null) ?? (atRoot ? workspaceRoot : null))
    : workspaceRoot;
  const setDisabled = (kind: string, disabled: boolean): void => {
    const button = dom.explorerContextMenu.querySelector<HTMLButtonElement>(`[data-ecxt="${kind}"]`);
    if (button) button.disabled = disabled;
  };
  setDisabled("new-file", !directoryTarget);
  setDisabled("new-folder", !directoryTarget);
  setDisabled("rename", !target || atRoot);
  setDisabled("delete", !target || atRoot);
  dom.explorerContextMenu.hidden = false;
  const width = dom.explorerContextMenu.offsetWidth;
  const height = dom.explorerContextMenu.offsetHeight;
  dom.explorerContextMenu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - width - 8))}px`;
  dom.explorerContextMenu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - height - 8))}px`;
  dom.explorerContextMenu.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
}

async function handleDroppedPaths(paths: string[]): Promise<void> {
  for (const raw of paths) {
    const path = normalizeDialogPath(raw);
    await openFilePath(path, undefined, undefined, true);
    if (!documents.some((candidate) => candidate.path && pathEquals(candidate.path, path))) {
      await openFolderPath(path, true);
    }
  }
}

function openEditorContextMenu(x: number, y: number): void {
  closeMenus();
  dom.editorContextMenu.hidden = false;
  const width = dom.editorContextMenu.offsetWidth;
  const height = dom.editorContextMenu.offsetHeight;
  dom.editorContextMenu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - width - 8))}px`;
  dom.editorContextMenu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - height - 8))}px`;
  dom.editorContextMenu.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
}

function openTabsContextMenu(x: number, y: number, documentId: string): void {
  closeMenus();
  tabsMenuTargetId = documentId;
  const setDisabled = (kind: string, disabled: boolean): void => {
    const button = dom.tabsContextMenu.querySelector<HTMLButtonElement>(`[data-tcxt="${kind}"]`);
    if (button) button.disabled = disabled;
  };
  setDisabled("save-all", !documents.some((documentRecord) => documentRecord.dirty));
  setDisabled("close-others", documents.length <= 1);
  setDisabled("close-all", documents.length === 0);
  dom.tabsContextMenu.hidden = false;
  const width = dom.tabsContextMenu.offsetWidth;
  const height = dom.tabsContextMenu.offsetHeight;
  dom.tabsContextMenu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - width - 8))}px`;
  dom.tabsContextMenu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - height - 8))}px`;
  dom.tabsContextMenu.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
}

async function renameActiveDocument(): Promise<void> {
  const current = activeDocument();
  if (!current) {
    showToast("Renommer", "Ouvrez un fichier à renommer.", "info");
    return;
  }
  if (!current.path) {
    await saveDocument(current, true);
    return;
  }
  const selected = await save({
    defaultPath: current.path,
    filters: FILE_TYPE_FILTERS,
  });
  if (!selected) return;
  const target = normalizeDialogPath(selected);
  if (pathEquals(target, current.path)) return;
  const occupant = documents.find(
    (document) => document !== current && document.path && pathEquals(document.path, target),
  );
  if (occupant) {
    showToast("Renommage impossible", `« ${occupant.name} » est déjà ouvert dans un autre onglet.`, "error");
    return;
  }
  const previousPath = current.path;
  try {
    dom.statusState.textContent = "Renommage…";
    const modified = await invoke<number>("rename_file", { source: previousPath, target });
    clearBuffer(previousPath);
    renameDocumentModel(current, target);
    current.path = target;
    current.name = fileNameFromPath(target);
    current.language = guessLanguageFromPath(target);
    monaco.editor.setModelLanguage(current.model, current.language);
    current.modified = modified;
    recents = removeRecent(previousPath);
    recents = rememberRecent("file", target, current.name);
    refreshChrome();
    showToast("Renommé", `${fileNameFromPath(previousPath)} → ${current.name}`, "success");
    scheduleProjectContextRefresh(target);
  } catch (error) {
    renderStatus();
    showToast("Renommage impossible", `${fileNameFromPath(previousPath)} : ${errorMessage(error)}`, "error");
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
  dom.replaceAll.disabled = fileScope
    ? fileMatches.length === 0
    : lastFolderMatches.length === 0;
  dom.scopeFolder.disabled = !workspaceRoot;
  dom.scopeFile.setAttribute("aria-pressed", String(fileScope));
  dom.scopeFolder.setAttribute("aria-pressed", String(!fileScope));
  dom.searchContext.textContent = fileScope
    ? `Dans ${activeDocument()?.name ?? "le fichier actif"}`
    : `Dans ${workspaceRoot?.name ?? "le dossier"}`;
}

function openSearchPanel(): void {
  dom.searchPanel.hidden = false;
  placeSearchPanelInitially();
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
    lastFolderMatches = matches;
    renderFolderResults(matches);
    setSearchCount(`${matches.length} résultat${matches.length > 1 ? "s" : ""}`);
  } catch (error) {
    if (generation !== folderSearchGeneration) return;
    lastFolderMatches = [];
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

async function replaceEveryMatch(): Promise<void> {
  if (searchScope === "folder") {
    await replaceAllInFolder();
    return;
  }
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

function buildFolderReplaceRegExp(): RegExp | null {
  try {
    let source = dom.searchRegex.checked
      ? dom.searchQuery.value
      : dom.searchQuery.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (dom.searchWord.checked) source = `\\b(?:${source})\\b`;
    return new RegExp(source, dom.searchCase.checked ? "g" : "gi");
  } catch {
    return null;
  }
}

// Remplacement multi-fichiers : réécrit chaque fichier du dernier résultat de
// recherche (les tampons non enregistrés sont ignorés pour ne rien perdre).
async function replaceAllInFolder(): Promise<void> {
  const expression = buildFolderReplaceRegExp();
  if (!expression) {
    setSearchCount("Expression régulière invalide", true);
    return;
  }
  if (lastFolderMatches.length === 0) return;
  const replacement = dom.replaceValue.value;
  const files = [...new Map(lastFolderMatches.map((match) => [match.path, match])).values()];
  const confirmed = await confirmAction(
    "Tout remplacer dans le dossier",
    `Remplacer dans ${files.length} fichier${files.length > 1 ? "s" : ""} ? Les fichiers modifiés seront enregistrés directement sur le disque.`,
    "Tout remplacer",
  );
  if (!confirmed) return;

  let touchedFiles = 0;
  let totalReplacements = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const file of files) {
    const openDirty = documents.find(
      (candidate) => candidate.path && pathEquals(candidate.path, file.path) && candidate.dirty,
    );
    if (openDirty) {
      skipped += 1;
      continue;
    }
    try {
      const content = await invoke<FileContent>("read_file", { path: file.path });
      const occurrences = content.contents.match(expression);
      if (!occurrences || occurrences.length === 0) continue;
      expression.lastIndex = 0;
      const next = content.contents.replace(expression, replacement);
      const modified = await invoke<number>("write_file", {
        path: file.path,
        contents: next,
        expectedModified: content.modified,
      });
      touchedFiles += 1;
      totalReplacements += occurrences.length;
      const documentRecord = documents.find(
        (candidate) => candidate.path && pathEquals(candidate.path, file.path),
      );
      if (documentRecord) {
        documentRecord.suppressDirty = true;
        documentRecord.model.setValue(next);
        documentRecord.suppressDirty = false;
        documentRecord.modified = modified;
        documentRecord.dirty = false;
        clearBuffer(documentBufferKey(documentRecord));
      }
    } catch (error) {
      errors.push(`${file.path} : ${errorMessage(error)}`);
    }
  }
  refreshChrome();
  const summary = `${totalReplacements} remplacement${totalReplacements > 1 ? "s" : ""} dans ${touchedFiles} fichier${touchedFiles > 1 ? "s" : ""}`;
  setSearchCount(
    errors.length > 0
      ? `${summary} — ${errors.length} échec${errors.length > 1 ? "s" : ""}`
      : summary,
  );
  if (skipped > 0) {
    showToast("Tout remplacer", `${summary} — ${skipped} fichier${skipped > 1 ? "s" : ""} ignoré${skipped > 1 ? "s" : ""} (modifications non enregistrées).`, "info");
  } else {
    showToast("Tout remplacer", errors.length > 0 ? `${summary}. ${errors[0]}` : `${summary}.`, errors.length > 0 ? "error" : "success");
  }
  void runFolderSearch();
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

function viewportBounds(): DOMRect {
  return new DOMRect(0, 0, window.innerWidth, window.innerHeight);
}

function clampTo(
  left: number,
  top: number,
  width: number,
  height: number,
  bounds: DOMRect,
): { left: number; top: number } {
  return {
    left: Math.max(0, Math.min(left, Math.max(0, bounds.width - width))),
    top: Math.max(0, Math.min(top, Math.max(0, bounds.height - height))),
  };
}

function anchorTopLeft(): { bounds: DOMRect; left: number; top: number } {
  const bounds = viewportBounds();
  const rect = dom.searchPanel.getBoundingClientRect();
  dom.searchPanel.style.right = "auto";
  dom.searchPanel.style.left = `${rect.left}px`;
  dom.searchPanel.style.top = `${rect.top}px`;
  return { bounds, left: rect.left, top: rect.top };
}

function placeSearchPanelInitially(): void {
  if (searchPanelPlaced) return;
  const stage = dom.editorStage.getBoundingClientRect();
  const panel = dom.searchPanel.getBoundingClientRect();
  const next = clampTo(stage.right - panel.width - 18, stage.top + 14, panel.width, panel.height, viewportBounds());
  dom.searchPanel.style.right = "auto";
  dom.searchPanel.style.left = `${next.left}px`;
  dom.searchPanel.style.top = `${next.top}px`;
  searchPanelPlaced = true;
}

function setupSearchPanelDrag(): void {
  const titlebar = dom.searchPanel.querySelector<HTMLElement>(".search-titlebar");
  if (!titlebar) return;
  titlebar.tabIndex = 0;
  titlebar.setAttribute("aria-label", "Déplacer le panneau de recherche (glisser ou flèches du clavier)");

  titlebar.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("button")) return;
    event.preventDefault();
    const rect = dom.searchPanel.getBoundingClientRect();
    const { bounds, left: baseLeft, top: baseTop } = anchorTopLeft();
    dom.searchPanel.classList.add("is-dragged");
    const startX = event.clientX;
    const startY = event.clientY;
    const move = (moveEvent: PointerEvent): void => {
      const next = clampTo(
        baseLeft + moveEvent.clientX - startX,
        baseTop + moveEvent.clientY - startY,
        rect.width,
        rect.height,
        bounds,
      );
      dom.searchPanel.style.left = `${next.left}px`;
      dom.searchPanel.style.top = `${next.top}px`;
    };
    const stop = (): void => {
      dom.searchPanel.classList.remove("is-dragged");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      codeEditor.layout();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  });

  titlebar.addEventListener("keydown", (event) => {
    const steps: Record<string, [number, number]> = {
      ArrowLeft: [-16, 0],
      ArrowRight: [16, 0],
      ArrowUp: [0, -16],
      ArrowDown: [0, 16],
    };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    const rect = dom.searchPanel.getBoundingClientRect();
    const { bounds } = anchorTopLeft();
    const next = clampTo(
      parseFloat(dom.searchPanel.style.left) + step[0],
      parseFloat(dom.searchPanel.style.top) + step[1],
      rect.width,
      rect.height,
      bounds,
    );
    dom.searchPanel.style.left = `${next.left}px`;
    dom.searchPanel.style.top = `${next.top}px`;
    codeEditor.layout();
  });

  window.addEventListener("resize", () => {
    if (dom.searchPanel.hidden || !searchPanelPlaced) return;
    const rect = dom.searchPanel.getBoundingClientRect();
    const next = clampTo(rect.left, rect.top, rect.width, rect.height, viewportBounds());
    dom.searchPanel.style.left = `${next.left}px`;
    dom.searchPanel.style.top = `${next.top}px`;
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
  if (!appWindow || windowClosePending) return;
  const dirty = documents.filter((document) => document.dirty);
  if (dirty.length > 0) {
    const confirmed = await confirmDiscard(
      `${dirty.length} fichier${dirty.length > 1 ? "s contiennent" : " contient"} des modifications non enregistrées. Fermer l’application supprimera ces modifications de la session.`,
    );
    if (!confirmed) return;
  }
  windowClosePending = true;
  try {
    // destroy() bypasses a second close-request event after our own confirmation.
    await appWindow.destroy();
  } catch (error) {
    windowClosePending = false;
    showToast("Fermeture impossible", errorMessage(error), "error");
  }
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
  element<HTMLButtonElement>("#preview-refresh").addEventListener("click", () => {
    if (browserTarget?.kind === "remote") {
      dom.previewFrame.src = browserTarget.url;
      return;
    }
    void refreshPreview(true);
  });
  element<HTMLButtonElement>("#preview-external").addEventListener("click", () => {
    if (browserTarget?.kind === "remote") {
      void openUrl(browserTarget.url);
      return;
    }
    const current = activeDocument();
    if (current?.path && isHtmlDocument(current)) void openPath(current.path);
  });
  dom.closeFolder.addEventListener("click", () => void closeWorkspace());

  dom.themeToggle.addEventListener("click", () => applyTheme(activeTheme === "light" ? "dark" : "light"));
  dom.fileMenuTrigger.addEventListener("click", () => toggleMenu(dom.fileMenuTrigger, dom.fileMenu));
  dom.editMenuTrigger.addEventListener("click", () => toggleMenu(dom.editMenuTrigger, dom.editMenu));
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
        case "open-replace": openReplacePanel(); break;
        case "compare": openCompareDialog(); break;
        case "toggle-autosave": setAutosaveEnabled(!autosaveEnabled); break;
        case "undo": runEditorCommand("undo"); break;
        case "redo": runEditorCommand("redo"); break;
        case "cut": void copySelectionToClipboard(true); break;
        case "copy": void copySelectionToClipboard(false); break;
        case "paste": void pasteFromClipboard(); break;
        case "select-all": selectAllInEditor(); break;
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
      !dom.editMenu.contains(target) && !dom.editMenuTrigger.contains(target) &&
      !dom.recentMenu.contains(target) && !dom.recentTrigger.contains(target) &&
      !dom.editorContextMenu.contains(target) && !dom.explorerContextMenu.contains(target) &&
      !dom.tabsContextMenu.contains(target)) {
      closeMenus();
    }
  });

  dom.editor.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    openEditorContextMenu(event.clientX, event.clientY);
  });

  // Clic droit sur la barre d'onglets : menu maison au lieu du menu WebView2.
  // Sur le fond de la barre (aucun onglet visé), le menu par défaut est simplement
  // supprimé.
  dom.tabs.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const wrapper = event.target instanceof Element ? event.target.closest<HTMLElement>(".tab") : null;
    const documentId = wrapper?.dataset.documentId;
    if (documentId) openTabsContextMenu(event.clientX, event.clientY, documentId);
  });

  dom.explorerContent.addEventListener("contextmenu", (event) => {
    if (!workspaceRoot) return;
    event.preventDefault();
    const row = event.target instanceof Element ? event.target.closest<HTMLElement>(".tree-row") : null;
    const target = row?.dataset.path ? findTreeNode(workspaceRoot, row.dataset.path) : null;
    openExplorerContextMenu(event.clientX, event.clientY, target);
  });
  dom.explorerContextMenu.querySelectorAll<HTMLButtonElement>("[data-ecxt]").forEach((item) => {
    item.addEventListener("click", () => {
      const kind = item.dataset.ecxt;
      const target = explorerMenuTarget;
      const directoryTarget = target
        ? target.isDirectory
          ? target
          : ((workspaceRoot ? findParentNode(workspaceRoot, target.path) : null) ?? workspaceRoot)
        : workspaceRoot;
      closeMenus();
      if (kind === "new-file" && directoryTarget) void createExplorerEntry(directoryTarget, "file");
      else if (kind === "new-folder" && directoryTarget) void createExplorerEntry(directoryTarget, "folder");
      else if (kind === "rename" && target) void renameExplorerNode(target);
      else if (kind === "delete" && target) void deleteExplorerNode(target);
    });
  });
  dom.editorContextMenu.querySelectorAll<HTMLButtonElement>("[data-ctx]").forEach((item) => {
    item.addEventListener("click", () => {
      closeMenus();
      switch (item.dataset.ctx) {
        case "save": void saveDocument(); break;
        case "rename": void renameActiveDocument(); break;
        case "cut": void copySelectionToClipboard(true); break;
        case "copy": void copySelectionToClipboard(false); break;
        case "paste": void pasteFromClipboard(); break;
        case "search": openSearchPanel(); break;
        case "replace": openReplacePanel(); break;
        case "occurrences": runEditorCommand("editor.action.changeAll"); break;
        case "select-all": selectAllInEditor(); break;
      }
    });
  });
  dom.tabsContextMenu.querySelectorAll<HTMLButtonElement>("[data-tcxt]").forEach((item) => {
    item.addEventListener("click", () => {
      const kind = item.dataset.tcxt;
      const target = tabsMenuTargetId ? documents.find((documentRecord) => documentRecord.id === tabsMenuTargetId) ?? null : null;
      closeMenus();
      if (kind === "save" && target) void saveDocument(target);
      else if (kind === "save-all") void saveAllDocuments();
      else if (kind === "close" && target) void closeDocument(target.id);
      else if (kind === "close-others" && target) void closeOtherDocuments(target.id);
      else if (kind === "close-all") void closeAllDocuments();
    });
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
    lastFolderMatches = [];
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
  dom.searchPrevious.addEventListener("click", () =>
    selectMatch(activeMatchIndex < 0 ? fileMatches.length - 1 : activeMatchIndex - 1),
  );
  dom.searchNext.addEventListener("click", () => selectMatch(activeMatchIndex + 1));
  dom.replaceOne.addEventListener("click", replaceCurrent);
  dom.replaceAll.addEventListener("click", replaceEveryMatch);
  dom.scopeFile.addEventListener("click", () => setSearchScope("file"));
  dom.scopeFolder.addEventListener("click", () => setSearchScope("folder"));

  dom.previewForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void navigateBrowser(dom.previewUrl.value);
  });
  dom.previewUrl.addEventListener("focus", () => dom.previewUrl.select());
  dom.previewUrl.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      dom.previewUrl.value = addressForBrowserTarget();
    }
  });

  dom.promptInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      // La touche Entrée doit valider, pas déclencher le premier bouton
      // (Annuler) de la soumission implicite du formulaire.
      event.preventDefault();
      dom.promptDialog.returnValue = "confirm";
      dom.promptDialog.close();
    }
  });

  dom.compareDialog.addEventListener("close", () => {
    if (dom.compareDialog.returnValue === "confirm") openComparison();
  });
  element<HTMLButtonElement>("#diff-close").addEventListener("click", closeComparison);

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
    // Un dialogue modal (confirmation, saisie, comparaison) est prioritaire :
    // ignorer tout raccourci pendant son affichage (un second showModal()
    // lèverait une InvalidStateError).
    if (dom.confirmDialog.open || dom.promptDialog.open || dom.compareDialog.open) return;
    const control = event.ctrlKey || event.metaKey;
    if (!control) {
      if (event.key === "Escape") {
        if (diffEditor) {
          closeComparison();
          return;
        }
        if (!dom.searchPanel.hidden) closeSearchPanel();
        else closeMenus();
      }
      return;
    }
    const key = event.key.toLocaleLowerCase();
    const handled =
      key === "n" || key === "o" || key === "k" || key === "s" || key === "f" ||
      key === "h" || key === "d" || key === "w" || (key === "v" && event.shiftKey);
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
    } else if (key === "h") {
      openReplacePanel();
    } else if (key === "d") {
      openCompareDialog();
    } else if (key === "v" && event.shiftKey) {
      setPreviewVisible(!previewVisible);
      if (previewVisible) void refreshPreview(false);
    } else if (key === "w") {
      const current = activeDocument();
      if (current) void closeDocument(current.id);
    }
  }, true);

  window.addEventListener(
    "wheel",
    (event) => {
      if (!(event.ctrlKey || event.metaKey) || !isNativeApp) return;
      event.preventDefault();
      interfaceZoom = Math.round(
        Math.min(2.5, Math.max(0.5, interfaceZoom + (event.deltaY < 0 ? 0.1 : -0.1))) * 10,
      ) / 10;
      void getCurrentWebview()
        .setZoom(interfaceZoom)
        .catch(() => {
          // Zoom indisponible sur cette plateforme : silencieux.
        });
    },
    { passive: false },
  );

  if (appWindow) {
    void appWindow.onDragDropEvent((event) => {
      if (event.payload.type !== "drop") return;
      void handleDroppedPaths(event.payload.paths);
    });
    // Une seconde exécution de l'application (double-clic, « Ouvrir avec »)
    // transmet ses fichiers à cette fenêtre au lieu d'en ouvrir une nouvelle.
    void listen<string[]>("launch-files", (event) => {
      void handleLaunchFiles(event.payload);
    });
  }

  codeEditor.onDidChangeCursorPosition(renderStatus);
  codeEditor.onDidChangeModel(() => {
    renderStatus();
    updatePreviewAvailability();
  });

  if (appWindow) {
    void appWindow.onCloseRequested((event) => {
      if (windowClosePending || !documents.some((document) => document.dirty)) return;
      event.preventDefault();
      void requestWindowClose();
    });
  }
}

injectStaticIcons();
populateLanguages();
applyTheme(activeTheme, false);
setupResizers();
setupSearchPanelDrag();
registerActions();
dom.autosaveToggle.setAttribute("aria-checked", String(autosaveEnabled));
refreshChrome();
void initializeSession();
