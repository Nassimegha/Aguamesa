# Nuit de test + testeurs + subreddit public (P3 T6, manuel)

Le code de la T6 (limite de requêtes) est mergé. Le reste ne peut pas être
fait par un agent : comptes Reddit, posts, bannière. Procédure :

## 1. Recruter 20 à 50 testeurs (à lancer dès la semaine 1)

Poster sur r/Devvit + partager aux amis. Brouillon (EN) :

> **Playtest my Reddit game? ☕ Aguamesa — a midnight 3D café in a post**
>
> Hi! I built Aguamesa, a tiny nightly game that lives inside a Reddit
> post: 5 customers, 5 glasses, one pour each — stop exactly on the line.
> A new night drops every midnight UTC, with leaderboards, streaks and
> one-click score sharing in the comments.
>
> Looking for 20–50 playtesters this week. All you need is the Reddit app:
> open the pinned nightly post on <SUBREDDIT>, play 2 minutes, and reply
> to this thread with your phone model + anything that felt off. Thanks!

Consigne aux testeurs : jouer UNE nuit complète (5 verres + Partager),
depuis l'app Reddit sur téléphone, puis répondre : modèle du téléphone,
fluidité, bug éventuel, capture si possible.

## 2. Nuit de test : zéro erreur dans les logs

1. `devvit playtest` sur le subreddit de test, la veille au soir.
2. Minuit UTC : vérifier que le post « Service de la nuit #N » apparaît
   seul et épinglé, avec les 5 verres du jour.
3. Jouer la nuit sur 2 comptes + faire jouer 2 amis (4 joueurs min :
   ligne de la foule, classement, partage, flair).
4. Le matin : `devvit logs` (ou la console Devvit) — exiger ZÉRO erreur
   serveur sur la nuit. Chercher `[aguamesa]`, `daily-night`, `429`
   (limite atteinte = budget trop bas ?) et les 500.
5. Rejouer un verre déjà versé : on doit revoir l'ancien score (pas de
   double essai), et finir deux fois : même résumé.

## 3. Subreddit public de démo

- [ ] Créer r/LastDropGame (ou le nom choisi), public.
- [ ] Description + bannière de P2 en place.
- [ ] Installer l'app dessus, menu mod visible (« Publier la nuit
      maintenant », « Choisir la boisson du jour »).
- [ ] Publier une nuit via le menu, la jouer de bout en bout sur
      téléphone, vérifier post + commentaire + flair.
- [ ] Épingler les règles : 1 essai/jour, `!boisson <idée>` pour proposer
      la boisson du lendemain.
