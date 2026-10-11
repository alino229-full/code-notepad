# Serveur MCP Code Notepad

Permet à un assistant (Claude Code, etc.) de piloter Code Notepad **sans fenêtre visible** : écrire et modifier du
code, formater, enregistrer, afficher l'aperçu HTML du navigateur intégré, interagir avec la page, et filmer le tout.

## Principe

- L'application est lancée avec `CODE_NOTEPAD_AUTOMATION=1` : instance indépendante (pas d'instance unique),
  fenêtre placée hors de l'écran et absente de la barre des tâches, profil WebView2 temporaire (rien ne touche à
  ta session habituelle).
- WebView2 est lancé en débogage à distance sur un port libre local ; le serveur s'y connecte avec `puppeteer-core`.
- Dans ce mode seulement, l'interface expose `window.__notepad` (voir la fin de `src/main.ts`). Sans la variable
  d'environnement, rien n'est exposé.

## Installation

```bash
npm install            # à la racine : interface
npm run tauri build -- --no-bundle   # produit src-tauri/target/release/code-notepad.exe avec l'interface embarquée
cd mcp && npm install
```

> `cargo build --release` seul n'embarque pas l'interface (l'appli cherche alors `localhost:1420`) : utiliser la
> commande Tauri ci-dessus. `CODE_NOTEPAD_EXE` permet d'indiquer un autre exécutable.

## Déclaration (Claude Code, `.mcp.json`)

```json
{ "mcpServers": { "code-notepad": { "command": "node", "args": ["D:/www/code-notepad/mcp/server.mjs"] } } }
```

## Outils

`notepad_start`, `notepad_stop`, `notepad_state`, `notepad_open_folder`, `notepad_open_file`, `notepad_write_file`,
`notepad_get_text`, `notepad_set_text`, `notepad_type` (frappe progressive, texte exact), `notepad_select`,
`notepad_goto`, `notepad_format`, `notepad_save`, `notepad_preview`, `notepad_press`, `notepad_click`,
`notepad_type_into`, `notepad_preview_text`, `notepad_screenshot`, `notepad_record_start` / `notepad_mark` /
`notepad_wait` / `notepad_record_stop`.

L'enregistrement écrit `raw.mp4` (vrais pixels) et `events.json` au format de SubtitleForge :
`node <subtitleforge>/engine/demo-post.mjs <dossier> --size 1920x1080` ajoute le zoom automatique sur ce qui est tapé.
Pour 1920×1080 réels : fenêtre 1600×900 avec `scale: 1.2`.

## Limites connues

- `notepad_type` insère via l'API de l'éditeur : pas de fermeture automatique des parenthèses ni d'indentation
  automatique ; fournir le texte déjà indenté (ou `notepad_format`).
- Le curseur de souris n'apparaît pas dans la vidéo (seul le curseur de texte de l'éditeur).
- Windows uniquement (WebView2).
