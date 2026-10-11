// Pilotage de Code Notepad sans fenêtre visible : l'application (Tauri) est lancée avec
// CODE_NOTEPAD_AUTOMATION (fenêtre hors écran, instance indépendante) et WebView2 en débogage à distance ;
// on s'y connecte avec puppeteer-core. Toute l'interface est celle de la vraie application.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { Recorder } from "./recorder.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_EXE = join(ROOT, "src-tauri", "target", "release", "code-notepad.exe");
const sleep = (ms) => new Promise((accept) => setTimeout(accept, ms));

/** Port libre choisi par le système. */
function freePort() {
  return new Promise((accept, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => accept(port));
    });
  });
}

export class Notepad {
  child = null;
  browser = null;
  page = null;
  profile = null;
  recorder = null;

  get running() {
    return Boolean(this.page);
  }

  /** Lance l'application hors écran et attend que l'interface de pilotage soit prête. */
  async start({ exe = process.env.CODE_NOTEPAD_EXE ?? DEFAULT_EXE, viewport = [1600, 900], scale = 1, theme } = {}) {
    if (this.running) throw new Error("Code Notepad est déjà lancé (notepad_stop d'abord).");
    if (!existsSync(exe)) throw new Error(`Exécutable introuvable : ${exe} (npm run build puis cargo build --release dans src-tauri).`);
    const port = await freePort();
    this.profile = mkdtempSync(join(tmpdir(), "code-notepad-mcp-"));
    this.child = spawn(exe, [], {
      stdio: "ignore",
      windowsHide: false,
      env: {
        ...process.env,
        CODE_NOTEPAD_AUTOMATION: "1",
        WEBVIEW2_USER_DATA_FOLDER: this.profile,
        // Fenêtre hors écran : sans ces options, Chromium la juge masquée et cesse de dessiner.
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-allow-origins=* --disable-features=CalculateNativeWinOcclusion --disable-backgrounding-occluded-windows --disable-renderer-backgrounding`,
      },
    });
    this.child.once("exit", () => { this.child = null; });
    const deadline = Date.now() + 60000;
    let lastError;
    while (Date.now() < deadline) {
      if (!this.child) throw new Error("Code Notepad s'est arrêté au démarrage.");
      try {
        this.browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, defaultViewport: null });
        break;
      } catch (error) {
        lastError = error;
        await sleep(400);
      }
    }
    if (!this.browser) throw new Error(`Connexion à WebView2 impossible : ${lastError?.message}`);
    // L'interface de l'application, pas une iframe d'aperçu.
    while (Date.now() < deadline && !this.page) {
      const pages = await this.browser.pages();
      this.page = pages.find((p) => /tauri\.localhost|localhost:1420/.test(p.url())) ?? null;
      if (!this.page) await sleep(300);
    }
    if (!this.page) throw new Error("Page de l'application introuvable.");
    const cdp = await this.page.createCDPSession();
    const [width, height] = viewport;
    await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false });
    this.viewport = { width, height, scale };
    await this.page.waitForFunction(() => Boolean(window.__notepad), { timeout: Math.max(1000, deadline - Date.now()) });
    if (theme) await this.call("setTheme", theme);
    return { port, viewport: this.viewport, ...(await this.state()) };
  }

  async stop() {
    if (this.recorder?.active) await this.recorder.stop();
    try { await this.browser?.disconnect(); } catch { /* déjà déconnecté */ }
    const pid = this.child?.pid;
    if (pid) {
      try { spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" }); } catch { /* déjà arrêté */ }
    }
    this.browser = this.page = this.child = this.recorder = null;
    await sleep(600);
    if (this.profile) {
      try { rmSync(this.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* profil temporaire */ }
      this.profile = null;
    }
  }

  need() {
    if (!this.page) throw new Error("Code Notepad n'est pas lancé (notepad_start).");
    return this.page;
  }

  /** Appelle une fonction de window.__notepad dans la page. */
  async call(name, ...args) {
    return this.need().evaluate((fn, params) => window.__notepad[fn](...params), name, args);
  }

  state() { return this.call("state"); }

  async openFolder(path) {
    await this.call("openFolder", resolve(path));
    await sleep(300);
    return this.state();
  }

  async openFile(path, line) {
    await this.call("openFile", resolve(path), line);
    await sleep(200);
    this.recorder?.mark("open", { path });
    return this.state();
  }

  /** Écrit un fichier sur le disque (dossiers créés au besoin) et l'ouvre dans un onglet. */
  async writeFile(path, content, open = true) {
    const full = resolve(path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, "utf8");
    return open ? this.openFile(full) : { written: full };
  }

  getText() {
    return this.need().evaluate(() => window.__notepad.editor.getValue());
  }

  async setText(text) {
    await this.need().evaluate((value) => {
      const { editor } = window.__notepad;
      editor.setValue(value);
      editor.setPosition(editor.getModel().getFullModelRange().getEndPosition());
    }, text);
  }

  /**
   * Insère du texte au curseur, par morceaux, comme une frappe (`unit` : char, word ou line).
   * Passe par l'API de l'éditeur : ni fermeture automatique des parenthèses ni indentation en double.
   */
  async type(text, { unit = "char", delay = 40, at = "cursor" } = {}) {
    const page = this.need();
    if (at !== "cursor") {
      await page.evaluate((where) => {
        const { editor } = window.__notepad;
        const model = editor.getModel();
        const position = where === "end" ? model.getFullModelRange().getEndPosition() : { lineNumber: 1, column: 1 };
        editor.setPosition(position);
        editor.focus();
      }, at);
    }
    const start = this.recorder?.now();
    const bbox = await this.cursorBox();
    await page.evaluate(async (value, mode, pause) => {
      const { editor } = window.__notepad;
      const pieces = mode === "line" ? value.match(/[^\n]*\n|[^\n]+$/g) : mode === "word" ? value.match(/\s+|[^\s]+/g) : [...value];
      for (const piece of pieces ?? []) {
        const { monaco } = window.__notepad;
        // Le curseur se place d'après l'édition réellement appliquée (les fins de ligne CRLF comptent double).
        editor.executeEdits("mcp", [{ range: editor.getSelection(), text: piece, forceMoveMarkers: true }], (inverse) => {
          const end = inverse[0].range.getEndPosition();
          return [new monaco.Selection(end.lineNumber, end.column, end.lineNumber, end.column)];
        });
        editor.revealPositionInCenterIfOutsideViewport(editor.getPosition());
        await new Promise((accept) => setTimeout(accept, pause));
      }
    }, text, unit, delay);
    this.recorder?.event({ type: "type", t0: start, t1: this.recorder.now(), bbox, chars: text.length });
    return this.state();
  }

  /** Sélectionne la première occurrence d'un texte ; `collapse` place le curseur au début (start) ou à la fin (end) de l'occurrence. */
  selectText(find, collapse) {
    return this.need().evaluate((text, mode) => {
      const { editor, monaco } = window.__notepad;
      const match = editor.getModel().findMatches(text, false, false, true, null, false)[0];
      if (!match) throw new Error(`Texte introuvable dans le fichier actif : ${text}`);
      let range = match.range;
      if (mode === "end") range = new monaco.Range(range.endLineNumber, range.endColumn, range.endLineNumber, range.endColumn);
      if (mode === "start") range = new monaco.Range(range.startLineNumber, range.startColumn, range.startLineNumber, range.startColumn);
      editor.setSelection(range);
      editor.revealRangeInCenterIfOutsideViewport(range);
      editor.focus();
      return { line: range.startLineNumber, column: range.startColumn };
    }, find, collapse);
  }

  goto(line, column = 1) {
    return this.need().evaluate((l, c) => {
      const { editor } = window.__notepad;
      editor.setPosition({ lineNumber: l, column: c });
      editor.revealPositionInCenter({ lineNumber: l, column: c });
      editor.focus();
    }, line, column);
  }

  async format() {
    await this.need().evaluate(() => window.__notepad.editor.getAction("editor.action.formatDocument").run());
    await sleep(500);
  }

  async save() {
    await this.call("save");
    this.recorder?.mark("save");
    return this.state();
  }

  async preview(visible = true) {
    await this.call("setPreview", visible);
    if (visible) await sleep(1500);
    return this.state();
  }

  /** Zone du curseur dans la page (pour le zoom automatique au montage). */
  async cursorBox() {
    return this.need().evaluate(() => {
      const { editor } = window.__notepad;
      const at = editor.getScrolledVisiblePosition(editor.getPosition());
      const host = editor.getDomNode()?.getBoundingClientRect();
      if (!at || !host) return undefined;
      return { x: Math.max(0, host.x + at.left - 300), y: Math.max(0, host.y + at.top - 60), width: 700, height: at.height + 120 };
    });
  }

  /** Cadre de l'aperçu intégré (iframe d'une autre origine). */
  previewFrame() {
    const frame = this.need().frames().find((f) => f !== this.page.mainFrame() && /codenotepad/.test(f.url()));
    if (!frame) throw new Error("Aucune page dans l'aperçu (notepad_preview d'abord, avec un fichier HTML actif).");
    return frame;
  }

  async elementBox(handle) {
    const box = await handle.boundingBox();
    return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : undefined;
  }

  /** Cible CSS, `text=…` ou `aria=…` dans la page de l'application ou dans l'aperçu. */
  async find(target, { inPreview = false, timeout = 10000 } = {}) {
    const scope = inPreview ? this.previewFrame() : this.need();
    const selector = target.startsWith("text=") ? `::-p-text(${JSON.stringify(target.slice(5))})` : target.startsWith("aria=") ? `::-p-aria(${JSON.stringify(target.slice(5))})` : target;
    const handle = await scope.waitForSelector(selector, { visible: true, timeout });
    if (!handle) throw new Error(`Élément introuvable : ${target}`);
    return handle;
  }

  async click(target, options = {}) {
    const start = this.recorder?.now();
    const handle = await this.find(target, options);
    const bbox = await this.elementBox(handle);
    await handle.click();
    this.recorder?.event({ type: "click", t0: start, t1: this.recorder.now(), bbox, label: target });
    await sleep(250);
  }

  async typeInto(target, text, { inPreview = false, delay = 60 } = {}) {
    const start = this.recorder?.now();
    const handle = await this.find(target, { inPreview });
    const bbox = await this.elementBox(handle);
    await handle.click();
    await handle.type(text, { delay }); // ElementHandle.type vise aussi l'aperçu, d'une autre origine
    this.recorder?.event({ type: "type", t0: start, t1: this.recorder.now(), bbox, chars: text.length });
  }

  async press(keys) {
    const parts = keys.split("+");
    const key = parts.pop();
    for (const m of parts) await this.page.keyboard.down(m);
    await this.page.keyboard.press(key);
    for (const m of parts.reverse()) await this.page.keyboard.up(m);
    this.recorder?.mark("press", { keys });
    await sleep(150);
  }

  async previewText(target = "body") {
    const frame = this.previewFrame();
    return frame.$eval(target, (el) => el.innerText);
  }

  screenshot() {
    return this.need().screenshot({ type: "png" });
  }

  async startRecording(dir, { fps = 30 } = {}) {
    if (this.recorder?.active) throw new Error("Un enregistrement est déjà en cours.");
    this.recorder = new Recorder(this.need(), { dir: resolve(dir), fps, viewport: this.viewport });
    await this.recorder.start();
    return { dir: resolve(dir) };
  }

  async stopRecording() {
    if (!this.recorder?.active) throw new Error("Aucun enregistrement en cours.");
    return this.recorder.stop();
  }
}
