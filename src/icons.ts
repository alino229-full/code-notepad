const paths = {
  app: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v6h6"/><path d="m10 13-2 2 2 2m5-4 2 2-2 2m-2-5-1 6"/>',
  chevronDown: '<path d="m7 10 5 5 5-5"/>',
  chevronRight: '<path d="m10 7 5 5-5 5"/>',
  close: '<path d="m7 7 10 10M17 7 7 17"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v6h6"/>',
  folder: '<path d="M3 6h7l2 2h9v11H3z"/>',
  folderOpen: '<path d="M3 7h7l2 2h9l-2 10H4z"/><path d="M3 7v12"/>',
  maximize: '<rect x="5" y="5" width="14" height="14" rx="1"/>',
  minimize: '<path d="M5 12h14"/>',
  moon: '<path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  newFile: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v6h6M12 12v6m-3-3h6"/>',
  openFile: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v6h6M9 15h6m-2-2 2 2-2 2"/>',
  panelLeft: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  preview: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
  redo: '<path d="m15 7 4 4-4 4"/><path d="M19 11h-8a6 6 0 0 0-6 6"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  save: '<path d="M5 3h12l3 3v15H4V3z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  undo: '<path d="m9 7-4 4 4 4"/><path d="M5 11h8a6 6 0 0 1 6 6"/>',
  external: '<path d="M14 3h7v7m0-7-9 9"/><path d="M18 13v7H4V6h7"/>',
} as const;

export type IconName = keyof typeof paths;

export function icon(name: IconName, className = "icon"): string {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}

