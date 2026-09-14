import type * as monaco from "monaco-editor";

export type Theme = "light" | "dark";
export type RecentKind = "file" | "folder";
export type SearchScope = "file" | "folder";

/** Cible courante du navigateur intégré : fichier local ou page http(s). */
export type BrowserTarget =
  | { kind: "local"; path: string }
  | { kind: "remote"; url: string };

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isSymlink: boolean;
}

export interface DirectoryListing {
  entries: FileEntry[];
  truncated: boolean;
}

export interface FileContent {
  contents: string;
  modified: number;
}

export interface TreeNode extends FileEntry {
  children?: TreeNode[];
  expanded?: boolean;
  loading?: boolean;
  truncated?: boolean;
}

export interface RecentEntry {
  kind: RecentKind;
  name: string;
  path: string;
  lastOpened: number;
}

export interface OpenDocument {
  id: string;
  name: string;
  path: string | null;
  language: string;
  model: monaco.editor.ITextModel;
  dirty: boolean;
  suppressDirty: boolean;
  /** Date de modification du fichier sur disque (ms) telle que lue à l'ouverture. */
  modified: number;
  disposeChangeListener: monaco.IDisposable;
}

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export interface DirectorySearchMatch {
  path: string;
  relativePath: string;
  line: number;
  column: number;
  lineText: string;
}

export interface ProjectSourceFile {
  path: string;
  contents: string;
}
