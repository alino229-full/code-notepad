import type * as monaco from "monaco-editor";

export type Theme = "light" | "dark";
export type RecentKind = "file" | "folder";
export type SearchScope = "file" | "folder";

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isSymlink: boolean;
}

export interface TreeNode extends FileEntry {
  children?: TreeNode[];
  expanded?: boolean;
  loading?: boolean;
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

