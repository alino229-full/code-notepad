---
version: 1
name: "Code Notepad"
description: "Un atelier optique léger pour éditer et prévisualiser les fichiers web locaux sans ouvrir un IDE complet."
colors:
  light-background: "#F5F8FA"
  light-surface: "#FFFFFF"
  light-text: "#17202A"
  light-border: "#DCE5EA"
  light-accent: "#176BFF"
  dark-background: "#172133"
  dark-surface: "#202D42"
  dark-text: "#E7EDF4"
  dark-accent: "#F4B860"
typography:
  display:
    fontFamily: "Sora, Segoe UI Variable Display, sans-serif"
  sans:
    fontFamily: "IBM Plex Sans, Segoe UI Variable Text, sans-serif"
  mono:
    fontFamily: "JetBrains Mono, Cascadia Code, monospace"
rounded:
  DEFAULT: "0.5rem"
  sm: "0.375rem"
  md: "0.625rem"
  lg: "0.875rem"
spacing:
  control-height: "2rem"
  panel-padding: "0.75rem"
  toolbar-gap: "0.375rem"
components:
  button: { }
  dialog: { }
  editor: { }
  explorer: { }
  preview: { }
  search: { }
  tabs: { }
  toast: { }
---

# Code Notepad Design System

## Overview

### Creative North Star

L'interface reprend la précision d'un instrument d'optique : surfaces nettes, repères fonctionnels, lumière froide et un seul trait coloré qui relie la source HTML à son rendu.

### Product context and register

- **Audience and primary job:** développeurs, intégrateurs et utilisateurs techniques qui veulent ouvrir, modifier, rechercher et prévisualiser rapidement un fichier local sans lancer un IDE complet.
- **Target market(s) and evidence:** application desktop généraliste, sans contrainte de marché spécifique ; l'interface française vient du brief utilisateur.
- **Locale(s) and language policy:** français pour toute l'interface possédée par l'application ; les noms de fichiers et le code restent inchangés.
- **Usage scene:** Windows desktop, ouvert fréquemment pour des interventions courtes ou une vérification HTML immédiate ; densité compacte mais respirante.
- **Register:** outil produit local.
- **Memorable signature:** une ligne de liaison part de l'onglet HTML actif vers l'en-tête de l'aperçu ; elle devient bleue en clair et ambre en sombre.
- **Restraint:** l'éditeur, l'arborescence et la recherche restent silencieux ; aucun effet décoratif dans les zones de lecture du code.
- **Anti-references:** ne pas devenir un clone de VS Code, un dashboard à cartes, une interface cyberpunk ou une fenêtre de recherche native déconnectée du logiciel.
- **Token ownership/runtime mapping:** ce fichier est la source normative ; `src/styles.css` implémente les tokens CSS et `src/main.ts` synchronise Monaco avec le thème actif.

## Colors

Le thème clair utilise le blanc minéral comme toile et le bleu optique uniquement pour l'action, le focus et la liaison avec l'aperçu. Le thème sombre conserve exactement la même hiérarchie en remplaçant le bleu par l'ambre. Les erreurs utilisent un rouge sémantique indépendant dans les deux thèmes. La sélection, les bordures et les scrollbars sont dérivées des tokens du thème actif.

## Typography

Sora porte seulement l'identité, l'accueil et les titres courts. IBM Plex Sans porte les contrôles et la navigation. JetBrains Mono porte le code, les chemins et les données techniques. Le texte d'interface ne descend pas sous 12 px et garde une hauteur de ligne minimale de 1,35.

## Layout

La fenêtre se compose d'une barre de titre compacte, d'une barre d'actions, puis d'un espace de travail redimensionnable : explorateur, éditeur et aperçu. L'explorateur peut être fermé, l'aperçu peut être affiché uniquement pour les documents HTML enregistrés, et chaque séparateur accepte la souris comme le clavier. L'accueil des récents remplace l'éditeur quand aucun document n'est ouvert afin de ne pas consommer d'espace permanent.

## Elevation & Depth

Les niveaux reposent d'abord sur les tons et les bordures. Une ombre courte est réservée à la recherche, aux menus et aux dialogues. L'éditeur et l'aperçu ne flottent pas. Le thème sombre évite les halos, sauf le point discret de synchronisation sur la liaison d'aperçu.

## Shapes

Les contrôles utilisent des rayons de 6 à 10 px. Les grandes surfaces restent rectangulaires et jointives comme les pièces d'un instrument. Les icônes utilisent des traits de 1,7 px et aucun emoji.

## Components

### Foundational visual states

Chaque action possède un état par défaut, survol, focus visible, pressé, désactivé et occupé. Le focus utilise un anneau de 2 px dans la couleur d'accent. Les états vides expliquent l'action disponible. Les erreurs restent visibles jusqu'à correction ou fermeture explicite.

### Buttons and actions

Le bouton plein est réservé à l'action principale du contexte. Les actions courantes utilisent un bouton tonal ou fantôme. Les actions de fermeture restent neutres ; elles ne deviennent dangereuses que lorsqu'une modification non enregistrée est réellement concernée.

### Navigation and data display

Les onglets représentent les fichiers de la session. Leur bouton de fermeture est toujours disponible au clavier. L'arborescence charge les sous-dossiers à l'ouverture pour rester rapide sur les grands projets. Les récents persistent, mais la session de travail ne se restaure pas automatiquement.

### Forms and overlays

La recherche avancée appartient à la surface éditeur : champ avec effacement explicite, options casse/mot entier/expression régulière, portée fichier ou dossier, navigation précédente/suivante et remplacement limité au fichier actif. Les pertes de modifications utilisent un dialogue accessible appartenant à l'application.

### Iconography

Icônes SVG linéaires internes, 16 à 18 px, coins arrondis et libellés textuels pour les actions principales. Les boutons uniquement iconiques ont un nom accessible et une infobulle native.

### Motion

Les panneaux utilisent une transition de 180 ms avec `cubic-bezier(0.22, 1, 0.36, 1)`. Les confirmations visuelles utilisent 120 ms. `prefers-reduced-motion` supprime les déplacements et conserve uniquement les changements instantanés d'état.

### Content and data visualization

La voix est directe : « Ouvrir un dossier », « Enregistrer », « Actualiser l'aperçu ». Les erreurs indiquent le fichier concerné et l'action corrective. Les chemins sont affichés en police mono et restent disponibles par titre lorsqu'ils sont tronqués.

## Do's and Don'ts

- **Do:** préserver la même structure et les mêmes positions entre les thèmes clair et sombre.
- **Do:** réserver l'accent à l'action, au focus et à la relation code-vers-aperçu.
- **Don't:** multiplier les panneaux permanents ou transformer les récents en barre latérale toujours ouverte.
- **Don't:** copier les proportions, couleurs et conventions visuelles de VS Code.
