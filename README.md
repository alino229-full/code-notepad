# Code Notepad

Éditeur de code desktop léger construit avec Tauri 2, TypeScript et Monaco Editor. Il est conçu pour ouvrir rapidement un fichier ou parcourir un dossier complet sans lancer un IDE généraliste.

## Fonctionnalités

- ouverture d’un fichier seul ou d’un dossier avec arborescence paresseuse des sous-dossiers ;
- onglets de session fermables, avec protection des modifications non enregistrées ;
- enregistrement atomique avec détection des modifications externes : un fichier changé par une autre application ne peut être écrasé qu’après confirmation ;
- enregistrement automatique optionnel (1,5 s après la dernière frappe) et tampons anti-crash : les modifications non enregistrées sont récupérées au démarrage suivant ;
- session réouvrable au lancement et restaurée automatiquement après un rechargement de la page ;
- menu contextuel de l’explorateur : nouveau fichier, nouveau dossier, renommage et suppression vers la corbeille ;
- comparaison côte à côte de deux fichiers ouverts (diff Monaco, Ctrl+D) ;
- remplacement multi-fichiers depuis la recherche « Dossier », avec confirmation et récapitulatif ;
- historique persistant des fichiers et dossiers récents, sans restauration forcée de l’ancienne session ;
- coloration syntaxique et sélection manuelle du langage via Monaco Editor ;
- recherche avancée dans le fichier actif : casse, mot entier, expression régulière, navigation et remplacement ;
- menus Fichier, Édition (annuler, presse-papiers, sélection, recherche et remplacement) et Navigateur ;
- menu contextuel de l'éditeur en français : enregistrer, renommer le fichier actif, presse-papiers, recherche et remplacement ;
- recherche récursive dans les fichiers texte du dossier ouvert ;
- navigateur intégré : rendu des fichiers HTML locaux avec leurs CSS, images et scripts, et navigation libre par chemin local ou adresse http(s) saisie dans la barre d'adresse ;
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
npm run lint
npx tsc --noEmit
npm test
npm run build
cd src-tauri
cargo test
cargo clippy --all-targets -- -D warnings
```

Une exécution GitHub Actions (`.github/workflows/ci.yml`) applique ces vérifications à chaque push sur `main` et à chaque pull request.

## Sécurité du navigateur intégré

Le service de fichiers local ne sert que les ressources du dossier de travail autorisé : les traversées de chemin sont bloquées et le cache est désactivé pour refléter les changements enregistrés. Les pages — locales comme distantes — s'exécutent dans une iframe isolée de l'interface Tauri (origine opaque, sans accès IPC). Pendant l'affichage d'une page distante, le service de fichiers local est suspendu : aucune ressource locale ne peut être relue par cette page.
