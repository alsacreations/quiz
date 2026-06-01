# PeerQuiz — Quiz en temps réel sans serveur

Application quiz P2P inspirée de "Qui veut gagner des millions", avec un serveur de développement Vite et zéro backend.

## Installation

```bash
npm install
npm run dev
```

Puis ouvrir :

- `http://localhost:5173/` sur l'écran de l'organisateur (PC ou tablette)
- `http://localhost:5173/player.html` sur les mobiles des joueurs (même réseau)

## Comment l'utiliser

### Avant le jeu

- Créez vos questions dans l'éditeur (avec image optionnelle si besoin)
- Deux types de questions : **choix multiples** (A, B, C, D) ou **réponse libre**. En réponse libre, saisissez une réponse acceptée par ligne (ex. « Le Roi Lion », « Roi Lion », « The Lion King ») : la casse, les accents, la ponctuation et les articles / pronoms en début de réponse sont ignorés, et les petites fautes de frappe sont tolérées (désactivable par question). Les joueurs ont 3 essais ; le premier à trouver gagne le plus de points
- Les questions sont **sauvegardées automatiquement** en mémoire locale (IndexedDB) — elles persisteront même après un rechargement de page
- Vous pouvez **exporter** vos questions en JSON via le bouton "⬇ Exporter" pour les réutiliser plus tard ou les partager
- Vous pouvez **importer** une banque de questions existante via le bouton "⬆ Importer"
- Avant une nouvelle partie, cliquez sur "🗑 Tout effacer" pour réinitialiser la liste et préparer des questions neuves

### Pendant le jeu

- Les joueurs saisissent le code affiché ou scannent le QR code
- Cliquez **▶ Lancer question** pour envoyer chaque question, **Révéler réponse** pour afficher la bonne réponse en vert, puis **Scores** pour afficher le classement entre chaque manche

## Ce qui est intégré

- Charte graphique Qui veut gagner des millions — fond nuit profond, boutons hexagonaux bleus, typographie Cinzel dorée
- Barème exact : 1er correct → 10 pts, 2e → 6 pts, 3e → 3 pts, suivants → 1 pt (les faux ne rapportent rien)
- Questions avec image : glissez-déposez une photo dans l'éditeur, elle s'envoie encodée en base64 directement aux joueurs via P2P
- Côté joueur : seuls les 4 boutons de réponse sont visibles + son score. Une carte animée s'affiche après chaque réponse (rang, points gagnés)
- Côté organisateur : barre de progression des réponses en temps réel, liste des joueurs triée par score, classement final animé
- Polices Cinzel et Barlow servies localement via Fontsource (aucune requête vers Google Fonts)

Limite connue : les images volumineuses (> 500 Ko) ralentissent l'envoi P2P — préférez des images compressées pour les questions visuelles.

## Build production (tester en local)

```bash
npm run build     # génère dist/
npm run preview   # prévisualise le build
```

## Déploiement en production (GitHub Pages)

Le site est publié sur `https://quiz.alsacreations.com` par le workflow `.github/workflows/deploy.yml` : à chaque push sur `main`, GitHub Actions lance `npm run build` et déploie `dist/`.

Configuration initiale :

1. *Settings → Pages → Source* : choisir **GitHub Actions**
2. DNS : enregistrement `CNAME` `quiz` vers `<user-ou-org>.github.io`
3. *Settings → Pages* : cocher **Enforce HTTPS** (obligatoire pour WebRTC)

Le fichier `public/CNAME` conserve le domaine personnalisé à chaque déploiement.
