# Aguamesa : le projet complet

*Projet pour le Reddit Game of the Day Hackathon. Date limite : **8 décembre 2026 à 18h PST**, soit **le 9 décembre à 2h du matin heure du Maroc**. Objectif : la 1re place, **Best Daily Game, 15 000 $**.*

---

## 1. Le message qui résume tout

**Aguamesa** est un jeu quotidien sur Reddit où tu es serveur dans des lieux magiques.

Le geste est un seul doigt : **tu appuies pour verser, tu relâches pour arrêter.** Le but est de remplir le verre **exactement jusqu'à la ligne**. Tout le monde comprend en 1 seconde, sans lire de règles.

Chaque soir, des clients bizarres et attachants arrivent avec leur propre verre : la chope énorme du Géant, le dé à coudre de la Fée, le verre transparent du Fantôme qui disparaît, la potion à deux couches du Sorcier, le soda qui mousse après l'arrêt. Chaque verre ajoute **un seul petit twist**, jamais plus.

Le jeu se déroule sur une **carte de 6 lieux**. Chaque lieu a son thème, ses personnages, sa musique, ses twists et ses **10 niveaux**, du plus facile au plus dur. On commence au Café de Minuit, puis on débloque la Plage, le Chalet, la Fête foraine, le Bateau pirate, et enfin le Château hanté.

Chaque jour, il y a aussi **le Service du Jour** : les mêmes 5 verres pour tous les joueurs de Reddit, un score sur 500, un classement, une série de jours (streak), et le résultat partagé en un seul commentaire.

On joue **seul**, sans attendre personne, mais on sent la communauté partout :
- la **ligne de la foule** montre où les autres joueurs se sont arrêtés ;
- la **boisson du jour** est choisie par les commentaires ;
- les **nouveaux clients** sont proposés par les joueurs.

---

## 2. Pourquoi ce projet peut gagner

Les 4 critères des juges, et comment Aguamesa répond à chacun :

| Critère des juges | Ce que Aguamesa apporte |
|---|---|
| **Delightful UX** (fun, facile, joli) | Un seul geste, des retours satisfaisants (son qui monte, vibration, liquide qui bouge), des personnages drôles, des échecs comiques |
| **Polish** (qualité « prêt à publier ») | Un jeu simple, donc on peut le polir à fond en 3 semaines, avec un chargement rapide et un design mobile d'abord |
| **Reddit-y** (communauté, identité) | Ligne de la foule, résultat en commentaire, boisson du jour choisie par les commentaires, clients proposés par les joueurs, flair de streak |
| **Daily Content** (contenu qui revient) | Service du Jour, histoires des personnages qui avancent, Vendredi à l'aveugle, boss du dimanche, teaser de demain |

**Ce qu'on a appris des gagnants précédents :**
- **BridgeDit** (1re place) avait un geste tactile, un score clair, et du contenu créé par les joueurs.
- **SerpenTiles** (meilleur gameplay mobile) était calme et satisfaisant, et ses résultats étaient partagés dans Reddit.
- **krawlings** (meilleur contenu créé par les joueurs) reposait sur l'attachement à un personnage, une streak et du contenu de la communauté.
- **Monster Dating** (mention honorable) misait sur des personnages drôles.

Aguamesa **combine tous ces points forts** dans un jeu plus simple à comprendre que chacun d'eux.

**Ce que les juges ont dit d'éviter**, et ce qu'on fait à la place :
- **Une interface qui « fait IA ».** On fait un style dessiné à la main, chaleureux, avec une vraie identité.
- **Un thème Reddit trop littéral.** Pas de Snoo partout, notre propre univers.
- **Clones, plateformes simples, shooters, trivia, histoires collaboratives.** Aguamesa n'est rien de tout ça.

---

## 3. Le geste de base (le cœur du jeu)

1. Un verre est posé sur le comptoir, avec une **ligne dorée en pointillés**.
2. Tu **appuies** n'importe où sur l'écran : le robinet ou la bouteille verse.
3. Tu **relâches** : le versement s'arrête, mais quelques gouttes tombent encore (environ 0,1 seconde), comme dans la vraie vie.
4. Le liquide bouge un peu, puis se stabilise.
5. **Le score est calculé :**
   - **100** si tu es pile sur la ligne, avec un éclat ✨ et le mot « PERFECT » ;
   - entre 1 et 99 selon la distance à la ligne ;
   - **0 si ça déborde**, et le client se fait éclabousser (voir l'ajout n°5).
6. Le client réagit : sourire, haussement d'épaules, joie ou colère.

**Règle d'or :** jamais de texte à lire. Le premier verre du tout premier lancement **est** le tutoriel. Une main animée montre « appuie… relâche », et c'est tout.

**Le score devient des pourboires 💰.** Score parfait = gros pourboire, avec un bonus pour une série de verres parfaits.

---

## 4. La carte : 6 lieux

La carte est un joli chemin dessiné, qui ressemble à une carte au trésor, avec 6 lieux reliés. Chaque lieu est **verrouillé** jusqu'à ce que tu gagnes assez d'**étoiles** dans le lieu précédent.

```
 ☕ Café de Minuit → 🏖️ La Plage → 🏔️ Le Chalet → 🎡 La Fête foraine → 🏴‍☠️ Le Bateau pirate → 🏰 Le Château hanté
   (niv. 1-10)      (niv. 1-10)   (niv. 1-10)     (niv. 1-10)          (niv. 1-10)             (niv. 1-10)
```

Chaque lieu a :
- **son décor** : couleurs, musique et sons propres ;
- **2 à 3 clients habitués** avec leur petite histoire ;
- **1 twist principal**, qui s'ajoute à ceux des lieux d'avant ;
- **10 niveaux**, dont un **boss** au niveau 10 : la « boisson signature » de l'habitué.

### Lieu 1 : ☕ Le Café de Minuit (tutoriel)
- **Ambiance :** nuit, pluie sur la fenêtre, lampes chaudes, un chat qui dort.
- **Clients :**
  - **Le Géant**, qui veut être doux mais casse tout ;
  - **La Fée**, toute petite et pressée ;
  - **Le Chat barista**, qui n'est pas un client mais la mascotte.
- **Twists :** les tailles de verre. La chope énorme du Géant est longue à remplir, donc facile à dépasser. Le dé à coudre de la Fée se joue à une seule goutte.
- **Boss (niveau 10) :** le « Grand Chocolat » du Géant, dans une chope géante avec une ligne très fine.

### Lieu 2 : 🏖️ La Plage
- **Ambiance :** coucher de soleil, vagues, paillote en bambou.
- **Clients :**
  - **La Surfeuse**, toujours en retard ;
  - **Monsieur Crabe**, qui paie en coquillages ;
  - **La Sirène**, qui ne quitte jamais l'eau.
- **Twists :**
  - **Les noix de coco** ont une forme ronde : le niveau monte vite en haut, lentement au milieu.
  - **Le glaçon qui fond :** la glace fait monter le niveau quelques secondes après l'arrêt. Il faut donc s'arrêter **sous** la ligne.
- **Boss :** le cocktail « Coucher de soleil » de la Sirène, en **3 couches de couleur**.

### Lieu 3 : 🏔️ Le Chalet de Montagne
- **Ambiance :** neige, feu de cheminée, fenêtres givrées. Le chalet **regarde la montagne** : par la grande fenêtre derrière le comptoir, on voit le sommet enneigé et la cascade, pas la plage.
- **Clients :**
  - **Le Yéti**, timide ;
  - **La Skieuse**, qui ne jure que par la vitesse ;
  - **Grand-mère Ourse**, qui raconte des histoires.
- **Twists :**
  - **La vapeur** du chocolat chaud cache la ligne par moments.
  - **La chantilly** est une 2e couche à poser par-dessus.
- **Boss :** le « Chocolat du Yéti », avec vapeur, chantilly et une ligne qui ne se voit qu'une seconde sur deux.

### Lieu 4 : 🎡 La Fête foraine
- **Ambiance :** lumières colorées, manège, ballons, musique d'orgue.
- **Clients :**
  - **Le Clown**, qui fait des blagues nulles ;
  - **Le Magicien**, dont les verres changent de forme ;
  - **Robo**, le robot vendeur.
- **Twists :**
  - **La tasse qui tourne** sur un manège : la ligne passe derrière, il faut verser au bon moment.
  - **Le tapis roulant :** le verre avance et tu dois le remplir avant qu'il parte.
- **Boss :** le « Milkshake magique » du Magicien. Le verre change de forme pendant que tu verses.

### Lieu 5 : 🏴‍☠️ Le Bateau pirate
- **Ambiance :** mer agitée, lanternes, bois qui craque.
- **Clients :**
  - **Capitaine Barbe-Grise** ;
  - **Coco le perroquet**, qui répète tout ;
  - **Le Matelot**, qui a le mal de mer.
- **Twists :**
  - **Le bateau tangue :** le liquide penche, et il faut lire la ligne en biais.
  - **La bouteille qui fuit :** le niveau baisse pendant que tu verses, donc il faut aller vite.
- **Boss :** le « Grog du Capitaine », avec une tempête, une fuite et deux couches.

### Lieu 6 : 🏰 Le Château hanté (lieu final)
- **Ambiance :** violet et vert, bougies, portraits qui bougent.
- **Clients :**
  - **Le Fantôme**, qui cherche quelqu'un depuis 300 ans ;
  - **La Sorcière** ;
  - **Le Vampire**, qui ne commande que du jus de tomate.
- **Twists :**
  - **Le verre fantôme** disparaît par moments.
  - **La ligne invisible :** elle s'efface dès que tu commences à verser.
  - **Les potions à 3 couches.**
- **Boss final :** « La Potion des Ombres », en 5 couches, qui mélange tous les twists du jeu. La fin de l'histoire du Fantôme est révélée ici.

---

## 5. Le système de niveaux

### Les niveaux dans un lieu
- **10 niveaux par lieu**, soit 60 niveaux en tout.
- **1 niveau = 3 à 5 verres** à servir.
- **Étoiles par niveau :** ⭐ niveau réussi, ⭐⭐ bon score, ⭐⭐⭐ presque parfait.
- **Il faut 15 étoiles sur 30** dans un lieu pour débloquer le suivant. Les bons joueurs avancent vite, et les autres peuvent rejouer pour gagner plus d'étoiles.

### Comment la difficulté monte

| Bouton de difficulté | Facile (niveaux 1-3) | Moyen (niveaux 4-7) | Dur (niveaux 8-10) |
|---|---|---|---|
| Marge autour de la ligne | large | moyenne | très fine |
| Vitesse du versement | lente | normale | rapide, ou qui accélère |
| Twists par verre | 0 à 1 | 1 | 1 à 2 combinés |
| Nouveaux personnages | présentation | habitués | boss avec boisson signature |

**Principe :** chaque lieu **introduit 1 nouveau twist** dans ses premiers niveaux, le **combine** avec les anciens au milieu, puis le **pousse au maximum** dans le boss. On ne rajoute jamais plusieurs nouveautés à la fois.

### La progression joueur
- **Niveau de serveur** (Serveur Nv. 1, 2, 3…) : il monte avec l'expérience gagnée en jouant et s'affiche dans ton **flair Reddit**, par exemple « ☕ Serveur Nv. 12 ».
- **Les pourboires** servent à décorer **chaque lieu** : lampes, plantes, chat, guirlandes, parasol sur la plage, sapin au chalet, etc.

### Comment la carte et le côté quotidien vont ensemble

C'est important, car le hackathon s'appelle « Game of the Day ».

**Le Service du Jour reste le cœur du jeu.** Chaque jour, il y a 5 verres **identiques pour tout le monde**, tirés du **lieu de la semaine**. Cela donne un score sur 500, le classement, la streak et le partage en commentaire. Il est accessible même si tu n'as pas encore débloqué ce lieu sur la carte : c'est une « visite » qui te donne envie d'y aller.

**La carte est le mode aventure.** Pour garder l'envie de revenir chaque jour, **3 nouveaux niveaux se débloquent chaque jour** (énergie : 3 « services » par jour). Le joueur ne peut donc pas tout finir en une soirée.

**Faire le Service du Jour donne un bonus** : +1 étoile ou un ticket pour rejouer un niveau. Le quotidien fait ainsi avancer la carte.

---

## 6. Les 7 ajouts, tous intégrés

### Ajout 1 : 📊 La ligne de la foule (la plus importante)
- Après ton versement, une **ligne fantôme** apparaît à l'endroit où **la moyenne des joueurs** s'est arrêtée sur ce même verre.
- Un message s'affiche, par exemple **« Tu as battu 82 % des joueurs »**.
- On joue seul, mais on se sent dans la communauté.
- **Technique :** on garde dans Redis le nombre de versements et la somme des niveaux pour chaque verre du jour. C'est très léger.

### Ajout 2 : 🔊 Le son qui monte, plus la vibration
- Comme dans la vraie vie, **le son du versement monte** quand le verre se remplit. Les bons joueurs apprennent à verser **à l'oreille**.
- Petite **vibration** au moment d'un versement parfait (si le téléphone le permet).
- Chaque lieu a son bruit d'ambiance : pluie, vagues, feu, orgue, mer, vent.

### Ajout 3 : 📖 Les histoires des habitués
- Chaque habitué dit **une phrase par visite**, débloquée **seulement si tu le sers bien**.
- Les histoires avancent dans la semaine (Service du Jour) et dans les niveaux (carte).
- Exemple : le Fantôme cherche son amour perdu depuis 300 ans. On découvre la suite petit à petit, et la fin arrive au boss final du Château.
- **C'est ce qui fait revenir les gens « pour savoir la suite ».**

### Ajout 4 : 🏆 La collection de verres
- Chaque verre réussi parfaitement rejoint ton **étagère de collection**.
- Un **verre doré rare** apparaît **une fois par semaine**, au hasard dans le Service du Jour.
- L'étagère est visible sur ton profil dans le jeu, et tu peux la partager en image.

### Ajout 5 : 💦 Les échecs drôles
- Si ça déborde, le client se fait **éclabousser** et a une réaction comique, différente pour chacun :
  - le Géant éternue ;
  - la Fée est emportée par la vague ;
  - le Crabe fait des bulles.
- Un **replay de 2 secondes** peut être partagé en commentaire.
- **Perdre devient drôle**, donc on rejoue et on partage.

### Ajout 6 : 🍹 La boisson du jour choisie par la communauté
- Chaque jour, le jeu publie un post avec la question **« Nommez la boisson spéciale de demain ! »**.
- Le **commentaire le plus voté** devient la **boisson spéciale du lendemain**, avec son nom et sa couleur (les mods peuvent valider).
- Le nom de l'auteur s'affiche dans le jeu : « Boisson proposée par u/xxx ».
- C'est du contenu frais tous les jours, fait par les joueurs, sans effort pour nous.

### Ajout 7 : 🙈 Le vendredi à l'aveugle
- **Chaque vendredi**, la ligne **disparaît dès que tu commences à verser**. Il faut la mémoriser.
- C'est un petit défi spécial chaque semaine, dont on parle dans les commentaires.

### En plus, le rythme de la semaine
- **Lundi à jeudi :** Service normal.
- **Vendredi :** à l'aveugle.
- **Samedi :** « Rush », les 5 verres sont plus rapides.
- **Dimanche :** **Nuit du Boss**, un grand cocktail à 5 couches, et la fin de l'histoire de la semaine.
- **Teaser de demain :** à la fin de chaque service, on voit **l'ombre du premier client de demain**.

---

## 7. Les fonctions Reddit (Devvit) à utiliser

| Fonction | Utilisation dans Aguamesa |
|---|---|
| **Scheduler** (tâches planifiées) | Publier le post du Service du Jour à minuit, et préparer la boisson du jour |
| **Redis** | Scores, classement du jour et de tous les temps, streaks, moyennes pour la ligne de la foule, progression de la carte |
| **Commentaires** | Partage du résultat en 1 clic, par exemple `🍺98 🧚100 👻71 ⛵88 🧙94 = 451 · 🔥12` |
| **User flair** | « ☕ Serveur Nv. 12 · 🔥 12 nuits » |
| **Snoovatar** | L'avatar du joueur apparaît en petit client dans son propre café (option) |
| **Outils de mod** | Les mods valident la boisson du jour et les clients proposés |
| **Devvit Journeys** | Accueil des nouveaux joueurs, si c'est utile |

---

## 8. Mes recommandations pour la perfection

### Design et qualité
1. **Un style artistique unique.** Dessiné à la main, chaud, avec des contours doux. Pas d'interface « kit » ou « IA ». C'est ce que les juges remarquent en premier.
2. **Chaque toucher a un retour** : son, petite animation, vibration. Aucun écran mort.
3. **Chargement en moins de 2 secondes.** On commence à jouer en **1 tap** depuis le post Reddit.
4. **Mobile d'abord.** Tester chaque jour dans l'app Reddit sur un vrai téléphone, petit écran compris.
5. **Accessibilité.** Une ligne avec un motif, pas seulement une couleur (pour les daltoniens), et un son qu'on peut couper.

### Gameplay
6. **Même verre, même résultat.** Le versement doit être **100 % prévisible**, pour que le score soit juste.
7. **Score vérifié côté serveur.** Le serveur recalcule le score à partir du temps d'appui, pour éviter la triche.
8. **Un seul essai par jour** pour le Service du Jour, ce qui garde le classement juste. La carte, elle, peut se rejouer.
9. **La marge du « parfait »** doit être juste assez dure : environ 5 à 10 % des versements doivent être parfaits. À tester avec des amis.

### Communauté
10. **Un post de démo vivant.** Avant le 8 décembre, faire jouer 20 à 50 personnes (r/Devvit, amis) pour que les juges voient un classement et des commentaires actifs.
11. **Préparer 14 jours de contenu à l'avance** (Services et boissons), pour que le jeu ne soit jamais vide pendant le jugement.

### Taille du projet (le plus important)
12. **6 lieux × 10 niveaux, c'est beaucoup pour 3 semaines.** Ma recommandation :
    - **Lieux 1, 2 et 3 complets et parfaitement polis** : Café, Plage, Chalet, soit 30 niveaux.
    - **Lieux 4, 5 et 6 visibles sur la carte** avec une illustration et un cadenas « Bientôt », plus 2 ou 3 niveaux jouables chacun si le temps le permet.
    - Les juges préfèrent **3 lieux parfaits** à 6 lieux à moitié finis. La carte complète montre la vision, et les lieux finis montrent la qualité.
13. **Les niveaux sont générés à partir de données** (un fichier JSON par lieu, avec la forme du verre, la ligne, la vitesse et le twist), pas codés un par un. On ajoute un niveau en 1 minute.

---

## 9. Plan de travail jusqu'au 8 décembre

| Semaine | Dates | Objectif |
|---|---|---|
| **1** | 17 au 23 nov | Geste de base parfait (appuyer et relâcher, liquide, score, son qui monte), Café de Minuit avec 10 niveaux, Service du Jour avec post automatique, sauvegarde Redis |
| **2** | 24 au 30 nov | Carte, Plage et Chalet, étoiles et déblocage, ligne de la foule, classement, streak, flair, partage en commentaire, échecs drôles |
| **3** | 1er au 8 déc | Histoires des habitués, collection de verres, boisson du jour, vendredi à l'aveugle, boss du dimanche, polissage (sons, animations, petits écrans), playtests, post de démo, page Devpost |

**Dernier jour :** ne rien ajouter de nouveau. Seulement corriger, tester et soumettre **au moins 12 heures avant la fin**.

---

## 10. Explication détaillée de tout le projet

### 10.1 L'idée en une phrase
Aguamesa est un jeu où tu remplis des verres pile jusqu'à la ligne, pour des clients drôles, dans 6 lieux magiques, avec un défi commun chaque jour pour tout Reddit.

### 10.2 Pourquoi un geste aussi simple ?
Les juges notent surtout **l'expérience** et la **finition**. Un jeu simple :
- se comprend sans tutoriel, alors que les juges testent vite et sans lire ;
- peut être **poli au maximum** en 3 semaines ;
- marche parfaitement sur téléphone, avec un seul doigt.

La profondeur ne vient pas de règles compliquées. Elle vient des **twists de verres**, des **lieux**, des **personnages** et de la **communauté**.

### 10.3 Comment se passe une session typique
1. Le joueur voit le post « Aguamesa : Service du 18 novembre 🍹 Midnight Mango » sur Reddit.
2. Il tape, et le jeu s'ouvre directement sur le comptoir.
3. Il sert 5 clients en 1 à 2 minutes, et voit la ligne de la foule après chaque verre.
4. Il voit son score (par exemple 451/500), sa streak (🔥12) et son classement.
5. Il partage en 1 tap dans les commentaires et lit les autres résultats.
6. Il voit l'ombre du client de demain et se dit « je reviens demain ».
7. S'il a encore envie, il ouvre la carte et joue ses 3 niveaux du jour.

### 10.4 Ce qui fait revenir chaque jour (les crochets)
- **Le score** : battre son record et les autres.
- **La streak 🔥** : ne pas casser sa série de jours. Elle a des paliers (3, 7, 14 et 30 nuits) avec des récompenses : une déco, le verre doré, un badge de flair et une enseigne néon. Toutes les 7 nuits, on gagne un glaçon 🧊 qui sauve une nuit oubliée (2 maximum). Chaque nuit de série donne +1 % de pourboires (30 % maximum), sans changer le score du classement. Un trait à la craie par nuit s'ajoute sur l'ardoise derrière le comptoir.
- **Les histoires** : savoir la suite pour le Fantôme et les autres.
- **La collection** : trouver le verre doré de la semaine.
- **La carte** : débloquer le lieu suivant, avec 3 niveaux par jour.
- **La communauté** : voir si sa boisson a été choisie et lire les commentaires.
- **La surprise** : vendredi à l'aveugle, dimanche boss, teaser de demain.

### 10.5 Pourquoi c'est « Reddit-y » sans obliger à jouer avec d'autres
Le joueur n'attend jamais personne. Mais chaque partie est **colorée par la communauté** :
- la ligne de la foule ;
- le classement ;
- la boisson du jour venue des commentaires ;
- les clients proposés par les joueurs ;
- le partage des résultats.

C'est exactement ce que les juges appellent « community-minded ».

### 10.6 Comment la difficulté reste juste
- Le versement est **prévisible** : même verre, même temps d'appui, même résultat.
- Chaque lieu ajoute **un seul** nouveau twist à la fois.
- Les étoiles laissent avancer tout le monde, et les 3 étoiles récompensent les meilleurs.
- Le Service du Jour est **le même pour tous** et se joue en **un seul essai**, donc le classement est honnête.

### 10.7 Ce qui rend le projet différent de tout ce qui a gagné avant
Aucun gagnant précédent n'avait **à la fois** :
- un geste aussi simple et satisfaisant ;
- des personnages avec des histoires qui avancent chaque jour ;
- une carte de lieux avec progression ;
- une ligne de la foule qui montre la communauté en temps réel ;
- du contenu quotidien créé par les commentaires.

C'est cette combinaison, simple à comprendre mais riche à long terme, qui donne une vraie chance pour la 1re place.

### 10.8 Le texte de présentation pour Devpost (en anglais, car les juges lisent en anglais)

> **Aguamesa**: hold to pour, release to stop, hit the line. Every night, quirky customers bring their own glasses (a giant's mug, a fairy's thimble, a ghost's fading glass) across 6 magical places, from a midnight café to a haunted castle. Play the same Daily Service as all of Reddit, see where the crowd stopped, keep your streak, unlock new places, follow each regular's story, and let the comments pick tomorrow's special drink. One finger. One minute. One more pour.

### 10.9 Résumé des priorités si le temps manque
1. Le geste de base parfait. **Rien n'est plus important.**
2. Le Service du Jour, le score, la streak et le partage en commentaire.
3. La ligne de la foule.
4. Le Café et la Plage complets.
5. La carte avec les autres lieux en « bientôt ».
6. Les histoires, la collection et la boisson du jour.
7. Le reste : vendredi à l'aveugle, samedi rush, boss du dimanche.

---

*Vidéos de présentation déjà prêtes : `last-drop.mp4` (concept) dans le même dossier.*
