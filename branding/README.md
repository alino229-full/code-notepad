# Identité visuelle de Code Notepad

`code-notepad-master.png` est le master raster transparent de l’icône. Il ne doit pas être redimensionné manuellement pour la distribution.

Les déclinaisons officielles sont générées avec :

```powershell
npx tauri icon branding/code-notepad-master.png
```

Cette commande produit les fichiers Windows, macOS, iOS et Android dans `src-tauri/icons/`. L’interface utilise la version `128x128.png` pour éviter de charger le master haute définition.

## Palette

- Bleu électrique : `#176BFF`
- Bleu encre : `#172133`
- Blanc optique : `#F7FAFC`
- Ambre signature : `#F4B860`

Le symbole ne doit recevoir ni texte superposé, ni contour supplémentaire, ni changement de proportions.
