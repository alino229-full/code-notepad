# Code Notepad

Éditeur de code desktop léger construit avec Tauri 2, TypeScript et Monaco Editor. Il est conçu pour ouvrir rapidement un fichier ou parcourir un dossier complet sans lancer un IDE généraliste.

## Fonctionnalités

- ouverture d’un fichier seul ou d’un dossier avec arborescence paresseuse des sous-dossiers ;
- onglets de session fermables, avec protection des modifications non enregistrées ;
- historique persistant des fichiers et dossiers récents, sans restauration forcée de l’ancienne session ;
- coloration syntaxique et sélection manuelle du langage via Monaco Editor ;
- recherche avancée dans le fichier actif : casse, mot entier, expression régulière, navigation et remplacement ;
- recherche récursive dans les fichiers texte du dossier ouvert ;
- aperçu HTML intégré avec chargement des CSS, images et scripts locaux du dossier ;
- thèmes clair « Atelier optique » et sombre « Studio nocturne » ;
- interface clavier, focus visible, réduction des animations et dialogues accessibles.

## Développement

```bash
npm install
npm run tauri dev
```

Le serveur Vite seul permet d’inspecter l’interface, mais l’ouverture de fichiers, l’exploration du disque et l’aperçu local nécessitent l’exécution Tauri.

## Vérification

```bash
npm run build
cd src-tauri
cargo test
cargo clippy --all-targets -- -D warnings
```

## Sécurité de l’aperçu

Le navigateur intégré sert uniquement les ressources situées dans le dossier de travail autorisé. Les traversées de chemin sont bloquées, le cache est désactivé pour refléter les changements enregistrés et la page est exécutée dans une iframe isolée de l’interface Tauri.
