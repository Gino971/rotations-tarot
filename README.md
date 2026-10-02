# Rotations Tarot

Application mobile autonome : joueurs numérotés, sans noms, compte ni scores. Choisir l’effectif et le nombre de manches dans deux sélecteurs toujours visibles ; les placements se recalculent immédiatement. Consulter toutes les positions par joueur ou les tables de chaque manche. La session reste enregistrée dans ce navigateur, sur cet appareil.

## Utilisation

Depuis ce dossier, lancer `npm start`, puis ouvrir http://localhost:4173. Aucun téléchargement de dépendances n’est nécessaire. Un téléphone sur le même Wi-Fi peut consulter l’application à l’adresse `http://ADRESSE_IP_DU_MAC:4173` tant que le serveur reste lancé.

Pour une utilisation autonome sur les téléphones, publier la version préparée sur une adresse HTTPS, puis ouvrir cette adresse dans Safari et ajouter l’app à l’écran d’accueil en activant « Ouvrir comme app web » si proposé. Ouvrir ensuite l’app une première fois avec Internet, puis la rouvrir en mode avion pour vérifier l’installation. Après ce premier chargement, les fichiers et le calcul sont disponibles sur le téléphone : le Mac et le réseau ne sont plus nécessaires. La sauvegarde du plan reste locale à l’app ; il n’y a pas de synchronisation entre appareils. Si l’utilisateur efface les données de l’app ou si iOS les supprime, un nouveau chargement avec Internet sera nécessaire.

## Publication sur GitHub Pages

La nouvelle app doit avoir son propre dépôt, sans inclure le projet de tournoi d’origine. `npm run build` prépare uniquement les fichiers web dans `dist/`. Le dossier contient déjà le workflow `.github/workflows/pages.yml` qui lance les tests, prépare les fichiers puis publie avec GitHub Actions. Dans les paramètres Pages du nouveau dépôt, sélectionner la source « GitHub Actions ».

La préparation attribue au cache une version calculée à partir du contenu : chaque modification publiée déclenche une nouvelle installation des fichiers. L’app démarre directement depuis les fichiers conservés sur le téléphone et enregistre ses choix localement. Les icônes PNG permettent l’ajout à l’écran d’accueil sur iPhone.

L’accès par HTTP au Mac permet de tester, mais ne permet pas le cache hors ligne sur le téléphone. Utiliser l’adresse HTTPS de GitHub Pages pour installer la version autonome.

## Règles reprises de l’application d’origine

- `movements.js` est une copie inchangée de `frontend/rotations.js`. L’application fonctionne sans accéder à l’ancien dossier.
- Tables de 4 : schémas Howell à 3 et 4 tables, mouvements normaux et exceptions de l’application de tournoi au-delà. Les petites configurations utilisent son mouvement Club.
- Maximum de 7 manches, avec les limites propres aux mouvements : 6 manches à 3 tables, 5 à 4 tables, 5 à 6 tables et 6 à 8 tables. Le sélecteur respecte le maximum disponible.
- Effectif non multiple de 4 : un seul choix d’ajout de morts indique leur nombre exact (1 à 3), tables mixtes, ou un joueur exclu si l’effectif vaut 4k + 1. Aucun choix de calcul des scores.
- Comme dans le moteur d’origine : 7 joueurs donnent une table de 3 et une de 4 ; 11 donnent une table de 5 et une de 6. Les places 5 et 6 sont affichées « Exempt 1 » et « Exempt 2 ».
- À 6 joueurs en mode tables mixtes, tous restent à une table de 6 avec deux exempts, en suivant le décalage Club d’origine. Cette correction évite la table de 2 produite par le repli du moteur d’origine.
- Les morts occupent le Nord. Le traitement est aussi appliqué aux petites configurations où le moteur d’origine ne le faisait pas. Si un schéma Howell rassemble plusieurs morts à une table, les morts supplémentaires sont échangés avec le Nord de tables sans mort. Chaque joueur conserve un placement unique. À 5 joueurs, le choix des morts est désactivé : 3 morts ne peuvent pas occuper le Nord de 2 tables distinctes.
- Le mode exclu reprend le mécanisme de place réservée et de remplacement de l’app d’origine. L’utilisateur choisit manuellement l’exclu de chaque manche dans un sélecteur, au fil des résultats. Aucun exclu n’est choisi automatiquement ; un même joueur peut être exclu plusieurs fois. Une manche sans exclu choisi reste « À définir », sans placement anticipé. Un joueur exclu ne reçoit aucune table ni position pour cette manche. Les choix sont sauvegardés sur l’appareil. Changer l’effectif efface ces choix ; ajouter des manches conserve les choix déjà faits.
- Les numéros identifient les joueurs pendant toute la session. La première manche les place dans l’ordre Nord, Sud, Est, Ouest, en réservant les sièges des morts le cas échéant. Aucun tirage aléatoire ni serpentin dépendant des scores.

## Vérification

`npm test` vérifie les effectifs de 4 à 400, toutes les répartitions disponibles, l’absence de joueurs manquants ou doublés, le placement des morts au Nord, les limites de manches, les exclusions manuelles et les manches en attente, ainsi que la conformité au moteur d’origine pour les tables de 4. Les tests hors ligne vérifient la mise en cache de tous les fichiers et icônes, le démarrage sans accès réseau, les chemins de GitHub Pages et la préservation des caches d’autres apps.

Aucun fichier du projet d’origine n’est modifié. Tout le code et les données de cette nouvelle app sont contenus dans `rotations-web`.
