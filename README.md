# Micro-attaches de découpe — script Adobe Illustrator

**MicroAttaches.jsx** v1.0.0 — ajoute automatiquement de vraies micro-attaches (coupures, « tabs ») dans les tracés de coupe pour que les pièces restent tenues dans la plaque ou la feuille pendant la découpe : laser, plotter de découpe, table de découpe, CNC.
*Automatically adds real holding tabs (gaps, micro-joints) to cut paths so parts stay held in the sheet while cutting: laser, cutting plotter, flatbed cutter, CNC (FR/EN dialog).*

## Ce que fait le script

Pour qu'une pièce découpée ne tombe pas (ou ne bascule pas sous la buse) il faut laisser quelques petits passages non coupés sur son contour. Dans Illustrator il faut aujourd'hui les faire un par un : deux coups de Ciseaux à 0,6 mm d'écart, supprimer le petit segment, recommencer sur chaque pièce. Ce script le fait pour toute la sélection :

1. **il lit l'imbrication réelle des contours** : contour extérieur d'une pièce, trou dans la pièce, pièce dans un trou, etc. (tracés séparés, tracés transparents et groupes) ;
2. **il choisit le nombre d'attaches** : N par contour, ou une tous les X mm avec un minimum par contour ; les contours trop courts restent entiers ;
3. **il place les attaches sur les parties droites**, à distance réglable des angles et loin des courbes serrées, en les répartissant régulièrement et de préférence au milieu des côtés (un rectangle reçoit ses attaches sur les grands côtés, face à face) ;
4. **il coupe vraiment les tracés** : la coupure a exactement la largeur demandée le long du tracé, plus la compensation du faisceau (kerf) si besoin ; les courbes de Bézier sont découpées exactement (pas d'aplatissement), les droites gardent des poignées rentrées ;
5. **il garde l'apparence** : dans un tracé transparent, les morceaux restent dans le même tracé transparent ; un tracé simple devient un groupe de morceaux ayant le même contour, la même couleur et la même épaisseur (couleurs de coupe / gravure conservées).

Options :

- largeur de l'attache (mm) et compensation du faisceau (mm, ajoutée à la coupure : le faisceau mange la moitié de sa largeur de chaque côté) ;
- nombre par contour, ou espacement en mm avec minimum ;
- contours concernés : **pièces seulement** (les chutes intérieures tombent), **pièces et trous** (rien ne tombe), **trous seulement** (garder les chutes en place) ; tracés ouverts en option (rainurage, découpe de lignes) ;
- longueur minimale des contours à traiter ;
- éviter les angles et les courbes serrées, avec distance aux angles (mm) ;
- conserver une copie de l'original sur un calque masqué et verrouillé.

Trois actions :

- **Couper les tracés** : tout est fait en une fois. Les attaches qui n'ont pas pu être posées sur une partie droite (petites pièces toutes en courbes, dentelles) sont signalées par des repères orange sur le calque non imprimable **« Micro-attaches – à vérifier #n »**.
- **Poser seulement les repères** : des pastilles magenta sont posées sur le calque non imprimable **« Micro-attaches – repères #n »**, sans rien couper. Déplacez-les, copiez-en pour en ajouter, supprimez celles qui gênent (partie fragile, côté visible…).
- **Couper aux repères posés** : resélectionnez les tracés et relancez : chaque repère est projeté sur le tracé sélectionné le plus proche et devient une attache. Les repères trop loin d'un tracé restent en place et sont signalés ; les repères trop proches l'un de l'autre sont fusionnés.

Le bouton **Analyser** indique le nombre de contours (pièces, trous, ouverts), d'attaches et de contours laissés entiers, sans rien modifier. **Effacer les repères** supprime les calques de repères. Les réglages sont mémorisés dans un petit fichier local (dossier des données utilisateur).

## Pourquoi c'est nouveau

Vérifié le 16 octobre 2026 :

- **Illustrator** n'a aucune fonction d'attaches. Les réponses d'Adobe Community restent manuelles : « How do I cut a quick, accurate gap / hole in a path? » (2020 : Ciseaux entre deux repères à 0,6 mm, Shape Builder ; l'auteur conclut « I wish there was a faster way to do this for many different objects »), « How to quickly delete section or part of path(s) ». Même constat sur le forum Glowforge (« Creating tabs or bridges », 2025 : rectangles + union, à la main) et LaserUser (« Adding the breaks in illustrator is practically impossible… in hundreds of places »).
- **Le contournement par pointillés** (contour en tirets puis Décomposer, ou scripts *breakDashes.jsx* de Hiroyuki Sato et *DivideAndDash.jsx* de John Wundes) donne des coupures périodiques le long du tracé : il ne compte pas les attaches par pièce, ne tient pas compte des angles, met des coupures dans les trous comme dans les pièces et n'en met aucune sur les contours plus courts qu'un tiret.
- **Les attaches automatiques n'existent que hors d'Illustrator** : logiciels de pilotage laser (LightBurn, RDWorks « Bridge »), Glowforge Premium, sites web (sparq.tools « Tabs & Bridges »), logiciels d'imbrication (Vector Painter Nest), CAM (CamBam « Holding tabs »), extension Inkscape « Create Links (Breakaway Connectors) ». D'après les pages consultées, les plug-ins de plotter pour Illustrator (Graphtec Cutting Master 4, Roland CutStudio) proposent l'échenillage et la découpe perforée (périodique), pas des attaches placées par pièce.
- **GitHub et auteurs connus** : rien chez creold (seul *SplitPath*, qui coupe des tracés par Pathfinder), Hiroyuki Sato, John Wundes, Alexander Ladygin (*random-dash*), Kelso Cartography, ni dans les 209 scripts de vexy ; *LaserComb* (Alecat) fait des assemblages à créneaux, pas des attaches. Astute Graphics n'a pas d'outil d'attaches (Path Zipper fait l'inverse : il referme les écarts).
- Distinct de mon script **PontsPochoir** (ponts pleins ajoutés aux formes de pochoir pour retenir les contre-formes) : ici on laisse des passages non coupés dans les traits de coupe.

## Installation

- **Ponctuelle** : Fichier > Scripts > Autre script…, puis choisir `MicroAttaches.jsx`.
- **Permanente** : copier le fichier dans le dossier `Presets/<langue>/Scripts` d'Illustrator (par exemple `Adobe Illustrator 2026/Presets/fr_FR/Scripts` sur macOS ou `C:\Program Files\Adobe\Adobe Illustrator 2026\Presets\fr_FR\Scripts` sur Windows), puis redémarrer Illustrator. Le script apparaît dans Fichier > Scripts.

## Utilisation

1. Travaillez sur une **copie** de votre fichier.
2. Vectorisez les textes (Texte > Vectoriser), puis sélectionnez les tracés de coupe : tracés, tracés transparents ou groupes. Les objets verrouillés ou masqués, images, symboles et tracés de masque sont ignorés.
3. Lancez le script, réglez la largeur (par exemple 0,3–0,5 mm pour du papier ou du carton fin, 0,6–1 mm pour du MDF 3 mm, 1–2 mm pour du contreplaqué ou de l'acrylique épais), le nombre d'attaches et cliquez sur **Analyser**.
4. Cliquez sur **OK** avec « Couper les tracés », ou posez d'abord les repères pour les ajuster à la main.

**Annuler** : Ctrl+Z / Cmd+Z (plusieurs fois si besoin). Avec l'option cochée, une copie intacte de la sélection est aussi gardée sur le calque masqué **« Micro-attaches – original #n »**.

## Version cible et statut des tests

- Cible : Adobe Illustrator CC 2018 et plus récent (ExtendScript, Windows et macOS).
- **Non testé dans Illustrator.**
- Syntaxe vérifiée avec acorn en mode ES3 et ES5 (`npx acorn --ecma3` et `--ecma5`).
- Géométrie vérifiée sur données simulées (`tests/test-core.js`, 54 tests) : longueurs de courbes, découpe de Bézier (de Casteljau), extraction à cheval sur le point de départ, carré (attaches au milieu des côtés, à plus de 1,9 mm des angles, coupures de 0,8 mm exactement), rectangle (grands côtés, face à face), rectangle arrondi (attaches hors des arrondis, arrondis restés en courbes), cercle (répartition régulière, morceaux restés sur le cercle), étoile pointue, petit cercle (attaches signalées), tracés ouverts, imbrication pièce / trou / île, filtres, repères posés à la main (projection, fusion, repère trop loin), 300 contours aléatoires (longueurs conservées, ordre, nombre de morceaux), 500 contours.
- Logique Illustrator vérifiée sur objets simulés (`tests/test-simulation.js`, 30 tests) : tracé simple remplacé par un groupe de morceaux (apparence et nom conservés), tracé transparent « O » (extérieur coupé, contre-forme intacte, points lisses et poignées), analyse sans modification, textes / objets verrouillés comptés, repères puis coupe aux repères (repère supprimé, ajouté, trop loin), effacement des repères, calque « à vérifier », groupe avec tracé ouvert et tracé de masque, alertes sans document et sans sélection. Ces simulations ne remplacent pas un essai réel.

Pour lancer les tests : `node tests/test-core.js` puis `node tests/test-simulation.js` (Node.js seul, sans dépendance).

Limites : la largeur est mesurée le long du tracé (sur une courbe serrée la corde est très légèrement plus courte) ; les effets dynamiques (contours décalés, pointillés) ne sont pas lus, seule la géométrie du tracé compte ; un tracé qui se recoupe lui-même donne une imbrication à vérifier ; les contours en double ne sont pas détectés. Sur des milliers de pièces, l'opération peut prendre un moment.

Aucun appel réseau, aucune collecte de données.

## Licence

MIT © 2026 Amirouche Amwanes — voir [LICENSE](LICENSE).
