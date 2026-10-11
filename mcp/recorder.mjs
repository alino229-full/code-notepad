// Enregistrement vidéo de la fenêtre pilotée (screencast CDP, vrais pixels) : `raw.mp4` à cadence constante
// et `events.json` (clics, frappes, repères, avec la zone de chaque élément). Ce format est celui lu par
// SubtitleForge (`node engine/demo-post.mjs <dossier>`) : zoom automatique, attentes accélérées, repères de narration.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const sleep = (ms) => new Promise((accept) => setTimeout(accept, ms));

export class Recorder {
  active = false;
  frames = [];
  events = [];
  writes = [];
  t0 = null;

  constructor(page, { dir, fps = 30, viewport }) {
    Object.assign(this, { page, dir, fps, viewport });
  }

  /** Secondes depuis la première image. */
  now() {
    return this.t0 === null ? 0 : Math.max(0, Date.now() / 1000 - this.t0);
  }

  event(event) {
    this.events.push(event);
  }

  mark(id, extra = {}) {
    this.events.push({ type: "mark", t0: this.now(), id, ...extra });
  }

  async start() {
    const framesDir = join(this.dir, "frames");
    rmSync(framesDir, { recursive: true, force: true });
    mkdirSync(framesDir, { recursive: true });
    this.framesDir = framesDir;
    this.cdp = await this.page.createCDPSession();
    this.cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
      const file = `f${String(this.frames.length).padStart(6, "0")}.jpg`;
      this.frames.push({ file, ts: metadata?.timestamp ?? Date.now() / 1000 });
      this.writes.push(writeFile(join(framesDir, file), Buffer.from(data, "base64")));
      this.cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    });
    const { width, height, scale } = this.viewport;
    await this.cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: Math.round(width * scale), maxHeight: Math.round(height * scale), everyNthFrame: 1 });
    // Une image n'arrive que si l'écran change : on provoque un repaint pour obtenir la première.
    for (let i = 0; i < 60 && !this.frames.length; i++) {
      await this.page.evaluate(() => { document.documentElement.style.outline = document.documentElement.style.outline ? "" : "0.1px solid transparent"; });
      await sleep(50);
    }
    if (!this.frames.length) throw new Error("Aucune image reçue de la fenêtre (rendu suspendu ?).");
    this.t0 = this.frames[0].ts;
    this.active = true;
  }

  async stop() {
    await sleep(500);
    await this.cdp.send("Page.stopScreencast");
    const end = Date.now() / 1000;
    this.active = false;
    await Promise.all(this.writes);
    const lines = ["ffconcat version 1.0"];
    const count = Math.max(1, Math.round((end - this.t0) * this.fps));
    const step = (1 / this.fps).toFixed(6);
    for (let k = 0, f = 0; k < count; k++) {
      while (f + 1 < this.frames.length && this.frames[f + 1].ts <= this.t0 + k / this.fps) f++;
      lines.push(`file 'frames/${this.frames[f].file}'`, `duration ${step}`);
    }
    lines.push(`file 'frames/${this.frames.at(-1).file}'`);
    writeFileSync(join(this.dir, "frames.txt"), lines.join("\n"));
    execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "frames.txt", "-vf", "format=yuv420p", "-r", String(this.fps), "-c:v", "libx264", "-preset", "veryfast", "-crf", "12", "-movflags", "+faststart", "raw.mp4"], { cwd: this.dir });
    const duration = end - this.t0;
    const { width, height, scale } = this.viewport;
    const trace = { viewport: { width, height }, scale, fps: this.fps, duration, trim: { start: 0, end: duration }, frames: this.frames.length, events: this.events };
    writeFileSync(join(this.dir, "events.json"), JSON.stringify(trace, null, 2));
    rmSync(this.framesDir, { recursive: true, force: true });
    rmSync(join(this.dir, "frames.txt"), { force: true });
    return { dir: this.dir, video: join(this.dir, "raw.mp4"), duration: +duration.toFixed(2), events: this.events.length };
  }
}
