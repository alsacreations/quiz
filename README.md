# Quiz

Template de quiz à l'arrache.

## Description

Modèle simple pour créer des quiz interactifs utilisant des fichiers JSON pour stocker les questions et les réponses.

## Structure du projet

- `index.html`: Point d'entrée.
- `styles.css`: Styles (évidemment).
- `_template.json`: Modèle pour la création de nouveaux quiz.
- `cookies.json`, `http-headers.json`, `standards.json`: Exemples de fichiers de quiz.
- `README.md`: Ce fichier.
- `stars.svg`: Image SVG utilisée dans l'interface.

## Fonctionnement technique

Le quiz charge les questions à partir d'un fichier JSON sélectionné. L'utilisateur peut répondre aux questions et voir son score à la fin. Le JavaScript gère la logique du quiz, y compris le chargement des questions, la vérification des réponses et l'affichage des résultats.

## Comment utiliser

1. Clonez le dépôt.
2. Indiquez le chemin vers le fichier de quiz souhaité dans `index.html` pour la variable `quizFile`.
3. Ouvrez `index.html` dans votre navigateur.
4. Répondez aux questions.
5. Consultez votre score.

Pour créer un nouveau quiz :

1. Copiez `_template.json` et renommez-le (par exemple, `nouveau_quiz.json`).
2. Modifiez le contenu de `nouveau_quiz.json` avec vos propres questions et réponses, en suivant la structure du template.
3. Actualisez `index.html`.
