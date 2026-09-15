// Utilitaires de chemins, indépendants du DOM et de Monaco pour rester
// testables sous Vitest. Le flag Windows est injectable dans les tests.

export function isWindowsPlatform(platform: string | undefined): boolean {
  return typeof platform === "string" && /^win/i.test(platform);
}

const IS_WINDOWS = isWindowsPlatform(
  typeof navigator === "undefined" ? undefined : navigator.platform,
);

export function normalizePathWith(path: string, windows: boolean): string {
  const unified = path.replace(/\\/g, "/");
  return windows ? unified.toLocaleLowerCase() : unified;
}

export function normalizePath(path: string): string {
  return normalizePathWith(path, IS_WINDOWS);
}

export function pathEquals(left: string, right: string, windows = IS_WINDOWS): boolean {
  return normalizePathWith(left, windows) === normalizePathWith(right, windows);
}

export function isPathWithin(path: string, root: string, windows = IS_WINDOWS): boolean {
  const normalizedPath = normalizePathWith(path, windows);
  const normalizedRoot = normalizePathWith(root, windows).replace(/\/$/, "");
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

export function joinPath(root: string, child: string): string {
  const separator = root.includes("\\") ? "\\" : "/";
  return `${root.replace(/[\\/]$/, "")}${separator}${child}`;
}

export function isAbsoluteBasePath(value: string): boolean {
  return value.startsWith("/") || value.startsWith("\\\\") || /^[a-zA-Z]:[\\/]/.test(value);
}

export function resolveBasePath(root: string, base: string): string {
  return isAbsoluteBasePath(base) ? base : joinPath(root, base);
}

// Le dialogue Windows retourne des chemins verbatim « \\?\C:\… » : sans
// normalisation, le même fichier peut s'ouvrir dans deux onglets.
export function normalizeDialogPath(path: string): string {
  return path.replace(/^\\\\\?\\/, "");
}

export function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function extensionFromPath(path: string): string {
  const name = fileNameFromPath(path);
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLocaleLowerCase() : "";
}

export function parentDirectory(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  const cut = Math.max(normalized.lastIndexOf("\\"), normalized.lastIndexOf("/"));
  return cut > 0 ? normalized.slice(0, cut) : normalized;
}

export function fileUrlToPath(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "file:") return null;
    let pathname = decodeURIComponent(parsed.pathname);
    if (/^\/[a-zA-Z]:/.test(pathname)) pathname = pathname.slice(1);
    return pathname.replace(/\//g, "\\");
  } catch {
    return null;
  }
}
