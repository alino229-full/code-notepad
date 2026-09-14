import { defineConfig, type Plugin } from "vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";

const host = process.env.TAURI_DEV_HOST;

const SAVE_GUARD_PATH = "/__code-notepad-save-guard";
const SAVE_GUARD_WINDOW_MS = 2500;

function isFullReloadPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const data = payload as { type?: string; updates?: Array<{ type?: string } | undefined> };
  if (data.type === "full-reload") return true;
  if (data.type === "update" && Array.isArray(data.updates) && data.updates.length > 0) {
    return data.updates.every((update) => update?.type === "full-reload");
  }
  return false;
}

// L'éditeur peut s'ouvrir lui-même comme projet : une sauvegarde faite depuis
// l'application modifie alors une source servie par Vite, qui rechargerait la
// page (flash, session perdue puis restaurée). L'app prévient ce point de
// terminaison juste avant d'écrire ; les rechargements complets demandés dans
// la fenêtre qui suit sont ignorés. Les modifications faites hors de l'app
// conservent leur comportement normal (HMR / rechargement).
function codeNotepadSaveGuard(): Plugin {
  let suppressUntil = 0;
  return {
    name: "code-notepad-save-guard",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(SAVE_GUARD_PATH, (_request, response) => {
        suppressUntil = Date.now() + SAVE_GUARD_WINDOW_MS;
        response.statusCode = 204;
        response.end();
      });
      const patchSend = (channel: unknown): void => {
        if (!channel || typeof (channel as { send?: unknown }).send !== "function") return;
        const target = channel as { send: (payload: unknown) => void };
        const original = target.send.bind(target);
        target.send = (payload: unknown): void => {
          if (Date.now() < suppressUntil && isFullReloadPayload(payload)) return;
          original(payload);
        };
      };
      patchSend(server.ws);
      patchSend((server as unknown as { hot?: unknown }).hot);
    },
  };
}

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [codeNotepadSaveGuard()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
