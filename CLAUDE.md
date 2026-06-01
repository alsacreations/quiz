# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PeerQuiz is a real-time peer-to-peer quiz application styled after the French game show "Qui veut gagner des millions" (Who Wants to Be a Millionaire). It uses **Vite** as a dev server and bundler, with two HTML entry points (`index.html` = host, `player.html` = player) and no backend — pure WebRTC P2P.

## Development

```bash
npm install       # install dependencies
npm run dev       # start Vite dev server (http://localhost:5173)
npm run build     # production build → dist/
npm run preview   # preview the production build
```

Open `http://localhost:5173/` on the organizer's device and `http://localhost:5173/player.html` on players' devices (or phones on the same network).

## Architecture

### File structure

```text
peerquiz/
├── index.html            # organizer entry point (host)
├── player.html           # player entry point
├── public/               # copied as-is to dist/ (audio/, CNAME)
├── vite.config.js        # multi-page Vite config
├── package.json
└── src/
    ├── host.js           # host logic + event wiring
    ├── player.js         # player logic + event wiring
    ├── answer-match.js   # free-text answer matching (normalize + typo tolerance)
    └── styles/
        ├── shared.css    # CSS variables, font imports, reset
        ├── host.css      # host-specific styles
        └── player.css    # player-specific styles
```

### Dependencies

- **peerjs 1.5.4** — WebRTC data connections (peer-to-peer messaging, no server required)
- **qrcode 1.5.x** — QR code generation for the room join link (`QRCode.toCanvas`)
- **@fontsource/cinzel** — Cinzel font (weights 700, 900), served locally
- **@fontsource/barlow** — Barlow font (weights 400–700), served locally
- **vite** — dev server and bundler

### P2P message protocol

Host creates a PeerJS peer with ID `quiz-XXXXXX`. All game state is exchanged via WebRTC data connections using plain JSON objects:

```text
Host → Player:  question, reveal, result, finalScores, end, joined, lobby
Player → Host:  join (name), answer
```

Two question types (`type` field on the stored question, absent = `qcm`):

- `qcm`: `{ question, answers: [4], correct: 'A'..'D', image }`. Player sends `{ type: 'answer', answer: 'B' }`; one attempt.
- `text`: `{ type: 'text', question, accepted: [strings], fuzzy: bool, image }`. The `question` message carries `kind: 'text'` (no answers, so accepted values never leave the host). Player sends `{ type: 'answer', text }`; the host validates with `matchesAnswer()`. A wrong answer replies `result` with `retry: true, attemptsLeft` (max `MAX_TEXT_ATTEMPTS = 3`); the last failed attempt or a correct one sends the final `result`. `reveal` carries `kind: 'text', answer` (first accepted value).

Matching (`src/answer-match.js`): case, accents, punctuation and leading articles/pronouns are ignored; with `fuzzy` a Damerau-Levenshtein distance is tolerated (0 typo under 5 chars, 1 up to 8, 2 beyond; never on numbers).

### Game state machine (host-driven)

`Lobby` → `Question` (send question, collect answers) → `Reveal` (send correct answer + results) → repeat or `Final` (send leaderboard)

### Scoring

Points awarded by order of *correct* answers: 1st=10, 2nd=6, 3rd=3, 4th+=1. Defined in `POINTS` array in `src/host.js`.

### Images

Images are Base64-encoded client-side and transmitted directly over the P2P connection. Images above ~500 KB noticeably slow transmission.

### Question persistence (IndexedDB)

As of the latest update, questions entered by the organizer are **automatically saved to IndexedDB** (`peerquiz` database, `questions` object store) whenever a question is added, edited, or deleted. On page reload, questions are restored from storage.

**Export/Import**: Questions can be exported to a JSON file (including base64-encoded images) via the "⬇ Exporter" button, and imported from a JSON file via the "⬆ Importer" button. This allows organizers to save and reuse question banks across sessions or devices.

**Reset**: The "🗑 Tout effacer" button clears all questions and resets the game state (currentQIndex, editingQIndex, answerOrder). Requires user confirmation.

## Key locations in the code

- **CSS variables / theme colors**: `:root` block in `src/styles/shared.css`
- **Scoring constants**: `POINTS = [10, 6, 3, 1]` in `src/host.js`
- **PeerJS initialization**: `initPeer()` function in each JS file
- **Message dispatch**: `broadcast()` / `send()` in `src/host.js`, `conn.send()` in `src/player.js`
- **QR code generation**: `generateQR()` in `src/host.js`
- **IndexedDB wrapper**: `openDB()`, `saveQuestionsToDB()`, `loadQuestionsFromDB()` in `src/host.js` (lines ~6–60)
- **Question persistence hooks**: `saveQuestionsToDB()` calls in `saveQuestion()` and `deleteQuestion()` functions
- **Export/Import**: `exportQuestions()` and `importQuestions()` functions in `src/host.js`
- **Reset all questions**: `resetAllQuestions()` function in `src/host.js`
- **Action buttons**: Export/Import/Reset buttons in `index.html` (q-list-header) with corresponding listeners in `src/host.js` EVENT LISTENERS section

## Constraints

- Room IDs are lowercase-only — PeerJS enforces this
- PeerJS uses public STUN/signaling servers (`0.peerjs.com`); changing to a self-hosted broker requires updating the `Peer()` constructor options
- **Questions persist in IndexedDB** (browser-local storage) and survive page reload; game state (currentQIndex, players, answers) is still in-memory and lost on disconnect
- All UI text is in French
- All inline `onclick` attributes are replaced with `addEventListener` in the JS modules; dynamic HTML uses `data-*` attributes + event delegation
