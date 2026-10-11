#!/usr/bin/env node
// Serveur MCP « Code Notepad » : permet à l'assistant d'écrire, formater, enregistrer, prévisualiser et filmer
// du code dans le vrai éditeur, sans fenêtre visible (voir notepad.mjs).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Notepad } from "./notepad.mjs";

const notepad = new Notepad();
const server = new McpServer({ name: "code-notepad", version: "0.1.0" });

const json = (value) => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });
/** Enveloppe un outil : l'erreur revient à l'assistant au lieu de couper le serveur. */
const tool = (name, description, shape, run) =>
  server.registerTool(name, { description, inputSchema: shape }, async (args) => {
    try {
      return await run(args);
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: String(error?.message ?? error) }] };
    }
  });

tool("notepad_start", "Lance Code Notepad hors écran (instance indépendante, profil temporaire) et attend qu'il soit prêt.", {
  width: z.number().int().min(800).default(1600).describe("Largeur de la fenêtre en pixels CSS"),
  height: z.number().int().min(500).default(900),
  scale: z.number().min(1).max(3).default(1).describe("Facteur d'échelle (2 = captures en 4K pour 1920×1080)"),
  theme: z.enum(["light", "dark"]).optional(),
}, async ({ width, height, scale, theme }) => json(await notepad.start({ viewport: [width, height], scale, theme })));

tool("notepad_stop", "Ferme l'application pilotée (et arrête l'enregistrement en cours).", {}, async () => {
  await notepad.stop();
  return json("arrêté");
});

tool("notepad_state", "État : dossier ouvert, onglets, fichier actif, curseur, aperçu visible.", {}, async () => json(await notepad.state()));

tool("notepad_open_folder", "Ouvre un dossier comme projet (explorateur à gauche).", { path: z.string() }, async ({ path }) => json(await notepad.openFolder(path)));

tool("notepad_open_file", "Ouvre un fichier existant dans un onglet.", { path: z.string(), line: z.number().int().optional() }, async ({ path, line }) => json(await notepad.openFile(path, line)));

tool("notepad_write_file", "Écrit un fichier sur le disque (dossiers créés) et l'ouvre dans un onglet. Pour préparer un projet de démonstration.", {
  path: z.string(), content: z.string(), open: z.boolean().default(true),
}, async ({ path, content, open }) => json(await notepad.writeFile(path, content, open)));

tool("notepad_get_text", "Contenu complet du fichier actif.", {}, async () => json(await notepad.getText()));

tool("notepad_set_text", "Remplace tout le contenu du fichier actif (instantané).", { text: z.string() }, async ({ text }) => {
  await notepad.setText(text);
  return json(await notepad.state());
});

tool("notepad_type", "Insère du texte au curseur du fichier actif, progressivement comme une frappe. Texte exact : pas de fermeture automatique ni d'indentation en double (indenter soi-même ou utiliser notepad_format).", {
  text: z.string(),
  unit: z.enum(["char", "word", "line"]).default("char").describe("Taille de chaque morceau inséré"),
  delay_ms: z.number().int().min(0).max(2000).default(40).describe("Pause entre deux morceaux"),
  at: z.enum(["cursor", "end", "start"]).default("cursor").describe("Où insérer : au curseur, en fin ou en début de fichier"),
}, async ({ text, unit, delay_ms, at }) => json(await notepad.type(text, { unit, delay: delay_ms, at })));

tool("notepad_goto", "Place le curseur (ligne, colonne) dans le fichier actif.", { line: z.number().int().min(1), column: z.number().int().min(1).default(1) }, async ({ line, column }) => {
  await notepad.goto(line, column);
  return json(await notepad.state());
});

tool("notepad_select", "Sélectionne la première occurrence d'un texte du fichier actif (ou y place le curseur). Un notepad_type qui suit remplace la sélection : modifier du code existant.", {
  text: z.string(), collapse: z.enum(["none", "start", "end"]).default("none"),
}, async ({ text, collapse }) => json(await notepad.selectText(text, collapse === "none" ? undefined : collapse)));

tool("notepad_format", "Formate le document (Maj+Alt+F) : indentation propre.", {}, async () => {
  await notepad.format();
  return json(await notepad.getText());
});

tool("notepad_save", "Enregistre le fichier actif sur le disque.", {}, async () => json(await notepad.save()));

tool("notepad_preview", "Affiche ou masque l'aperçu (navigateur intégré) : un fichier HTML actif y est exécuté avec ses ressources locales.", {
  visible: z.boolean().default(true),
}, async ({ visible }) => json(await notepad.preview(visible)));

tool("notepad_press", "Appuie sur une touche ou un raccourci de l'application, par exemple « Control+s » ou « Control+d ».", { keys: z.string() }, async ({ keys }) => {
  await notepad.press(keys);
  return json(await notepad.state());
});

tool("notepad_click", "Clique sur un élément de l'interface (CSS, « text=… » ou « aria=… »), dans l'application ou dans l'aperçu.", {
  target: z.string(), in_preview: z.boolean().default(false),
}, async ({ target, in_preview }) => {
  await notepad.click(target, { inPreview: in_preview });
  return json("cliqué");
});

tool("notepad_type_into", "Clique dans un champ (de l'application ou de l'aperçu) et tape au clavier, touche par touche.", {
  target: z.string(), text: z.string(), in_preview: z.boolean().default(false), delay_ms: z.number().int().default(60),
}, async ({ target, text, in_preview, delay_ms }) => {
  await notepad.typeInto(target, text, { inPreview: in_preview, delay: delay_ms });
  return json("tapé");
});

tool("notepad_preview_text", "Texte affiché dans l'aperçu (tout le corps de la page, ou un sélecteur CSS).", { selector: z.string().default("body") }, async ({ selector }) => json(await notepad.previewText(selector)));

tool("notepad_screenshot", "Capture d'écran de l'application.", {}, async () => ({
  content: [{ type: "image", data: (await notepad.screenshot()).toString("base64"), mimeType: "image/png" }],
}));

tool("notepad_record_start", "Démarre l'enregistrement vidéo (vrais pixels). Les frappes, clics et repères sont notés pour le zoom automatique.", {
  dir: z.string().describe("Dossier de sortie (raw.mp4 et events.json)"), fps: z.number().int().min(10).max(60).default(30),
}, async ({ dir, fps }) => json(await notepad.startRecording(dir, { fps })));

tool("notepad_mark", "Pose un repère nommé dans l'enregistrement (pour caler la voix off sur ce moment).", { id: z.string(), text: z.string().optional() }, async ({ id, text }) => {
  if (!notepad.recorder?.active) throw new Error("Aucun enregistrement en cours.");
  notepad.recorder.mark(id, text ? { text } : {});
  return json("repère posé");
});

tool("notepad_wait", "Attend (affichage laissé à l'écran pour la vidéo). Les pauses de plus de 2,5 s peuvent être accélérées au montage avec why=wait.", {
  ms: z.number().int().min(0).max(120000), accelerate: z.boolean().default(false),
}, async ({ ms, accelerate }) => {
  const start = notepad.recorder?.now();
  await new Promise((accept) => setTimeout(accept, ms));
  if (notepad.recorder?.active) notepad.recorder.event({ type: accelerate ? "wait" : "hold", t0: start, t1: notepad.recorder.now() });
  return json("ok");
});

tool("notepad_record_stop", "Arrête l'enregistrement : écrit raw.mp4 et events.json. Pour le zoom et le montage : node <subtitleforge>/engine/demo-post.mjs <dossier>.", {}, async () => json(await notepad.stopRecording()));

process.on("exit", () => { if (notepad.child) try { process.kill(notepad.child.pid); } catch { /* déjà arrêté */ } });
await server.connect(new StdioServerTransport());
