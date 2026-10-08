# Documents d’arbitrage

La bibliothèque commune à tous les utilisateurs provient des fichiers `.txt` du dossier `arbitrage/`.

- **Ajouter** : déposer un fichier `.txt` UTF-8 dans ce dossier.
- **Remplacer** : remplacer le contenu du fichier existant.
- **Retirer** : retirer le fichier du dossier.
- **Renommer** : renommer le fichier ; son nom sans `.txt` devient le titre affiché dans l’app.

Conserver les sauts de page (caractère form feed) du texte extrait du PDF : ils servent à retrouver les pages d’origine. Sans saut de page, le document apparaît comme une seule page. Les PDF ne sont pas importés directement : il faut d’abord en extraire le texte.

`npm run build` reconstruit automatiquement `arbitrage.json` et prépare la publication. `npm start` reconstruit aussi la bibliothèque avant de lancer l’aperçu. Pour reconstruire seulement les textes : `npm run documents`.

Ne pas modifier `arbitrage.json` à la main : il est généré. Republier l’app après toute modification pour que tous les utilisateurs reçoivent la même bibliothèque ; la mise à jour remplace également la copie hors ligne.

## Gestion depuis l’aperçu

Ouvrir `library.html` sur le serveur local, ou le lien « Gérer la bibliothèque » de l’onglet Arbitrage. Les boutons Ajouter, Remplacer et Retirer modifient les fichiers du projet ; les PDF sont convertis automatiquement en texte grâce à `pdftotext` (Poppler). Les versions remplacées ou retirées sont conservées dans `documents/archives/`. Cette page est réservée à cet ordinateur et ne fait pas partie du site public. La publication reste une étape distincte.

Le bouton **Publier la bibliothèque** vérifie l’app, enregistre uniquement les documents dans le dépôt, les envoie et attend la confirmation GitHub Pages. Git et GitHub CLI (`gh`) doivent être configurés sur cet ordinateur. Il faut publier une première fois l’app avec son nouvel onglet avant de publier uniquement les documents. Le bouton ne publie pas les autres modifications de l’app.
