import './styles/host.css'
import Peer from 'peerjs'
import QRCode from 'qrcode'
import { matchesAnswer } from './answer-match.js'

// ===== INDEXEDDB =====
const DB_NAME = 'peerquiz'
const DB_VERSION = 1
const STORE_NAME = 'questions'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function saveQuestionsToDB() {
  try {
    const db = await openDB()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(questions, 'all')
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    showToast('Impossible de sauvegarder les questions.')
  }
}

async function loadQuestionsFromDB() {
  try {
    const db = await openDB()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get('all')
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    return []
  }
}

// ===== STATE =====
let peer = null
let connections = {}
let players = {}
let questions = []
let currentQIndex = -1
let phase = 'lobby'
let answerOrder = []
let currentImageB64 = null
let editingQIndex = null
let answerRevealed = false
let firstPlayerConnected = false

const POINTS = [10, 6, 3, 1]
const MAX_TEXT_ATTEMPTS = 3
const MAX_TEXT_LENGTH = 200

// ===== PEER INIT =====
function initPeer() {
  // Lowercase only — PeerJS server stores IDs in lowercase, uppercase causes peer-unavailable
  const roomId = 'quiz-' + Math.random().toString(36).substr(2, 6)
  peer = new Peer(roomId, {
    host: '0.peerjs.com',
    port: 443,
    path: '/',
    secure: true,
    debug: 0
  })

  peer.on('open', (id) => {
    document.getElementById('roomId').textContent = id
    document.getElementById('connDot').classList.add('online')
    document.getElementById('connLabel').textContent = 'Serveur connecté'
    generateQR(id)
  })

  peer.on('connection', (conn) => {
    conn.on('open', () => {
      connections[conn.peer] = conn
      conn.on('data', (data) => handlePlayerMessage(conn.peer, data))
      conn.on('close', () => removePlayer(conn.peer))
    })
  })

  peer.on('error', (e) => {
    document.getElementById('connLabel').textContent = 'Erreur: ' + e.type
  })
}

async function generateQR(id) {
  const origin = window.location.origin + window.location.pathname.replace(/[^/]*$/, '')
  const base = origin + 'player.html'
  const url = base + '?room=' + id
  document.getElementById('qrHint').textContent = url
  const canvas = document.createElement('canvas')
  document.getElementById('qrcode').appendChild(canvas)
  await QRCode.toCanvas(canvas, url, { width: 160, margin: 1 })
}

// ===== PLAYER MESSAGES =====
function handlePlayerMessage(peerId, data) {
  if (data.type === 'join') {
    const isFirstPlayer = !firstPlayerConnected
    players[peerId] = { name: data.name, score: 0, answered: false, attempts: 0 }
    send(peerId, { type: 'joined', name: data.name })
    if (phase === 'question' && currentQIndex >= 0) {
      send(peerId, questionMessage())
    } else {
      send(peerId, { type: 'lobby' })
    }
    renderPlayers()
    showToast(`${data.name} a rejoint la partie !`)
    // if (isFirstPlayer) {
      // firstPlayerConnected = true
      playSound('start.mp3')
    // }
  }

  if (data.type === 'answer' && phase === 'question') {
    const q = currentQuestion()
    const player = players[peerId]
    if (!player || player.answered) return

    let isCorrect
    if (isTextQuestion(q)) {
      if (typeof data.text !== 'string') return
      isCorrect = matchesAnswer(data.text.slice(0, MAX_TEXT_LENGTH), q.accepted, q.fuzzy !== false)
      player.attempts++
      if (!isCorrect && player.attempts < MAX_TEXT_ATTEMPTS) {
        send(peerId, { type: 'result', correct: false, retry: true, attemptsLeft: MAX_TEXT_ATTEMPTS - player.attempts })
        return
      }
    } else {
      isCorrect = data.answer === q.correct
    }
    player.answered = true

    if (isCorrect) {
      answerOrder.push(peerId)
      const rank = answerOrder.length
      const pts = POINTS[Math.min(rank - 1, POINTS.length - 1)]
      player.score += pts
      send(peerId, { type: 'result', correct: true, rank, pts, score: player.score })
    } else {
      send(peerId, { type: 'result', correct: false, rank: null, pts: 0, score: player.score })
    }

    renderPlayers()
    updateProgress()
  }
}

function removePlayer(peerId) {
  delete connections[peerId]
  delete players[peerId]
  renderPlayers()
}

function send(peerId, data) {
  if (connections[peerId] && connections[peerId].open) {
    connections[peerId].send(data)
  }
}

function broadcast(data) {
  Object.keys(connections).forEach(id => send(id, data))
}

// ===== QUESTION MANAGEMENT =====
function currentQuestion() { return questions[currentQIndex] }
function isTextQuestion(q) { return q.type === 'text' }

function questionMessage() {
  const q = currentQuestion()
  const base = { type: 'question', index: currentQIndex, question: q.question, image: q.image || null }
  return isTextQuestion(q)
    ? { ...base, kind: 'text', maxAttempts: MAX_TEXT_ATTEMPTS, maxLength: MAX_TEXT_LENGTH }
    : { ...base, kind: 'qcm', answers: q.answers }
}

function isValidQuestion(q) {
  if (!q || typeof q.question !== 'string') return false
  if (q.type === 'text') {
    return Array.isArray(q.accepted) && q.accepted.length > 0 && q.accepted.every(a => typeof a === 'string' && a.trim())
  }
  return Array.isArray(q.answers) && q.answers.length === 4 && ['A', 'B', 'C', 'D'].includes(q.correct)
}

function updateTypeFields() {
  const isText = document.getElementById('questionType').value === 'text'
  document.getElementById('qcmFields').style.display = isText ? 'none' : 'block'
  document.getElementById('textFields').style.display = isText ? 'block' : 'none'
}

function saveQuestion() {
  const q = document.getElementById('inputQuestion').value.trim()
  const isText = document.getElementById('questionType').value === 'text'
  let obj
  if (isText) {
    const accepted = document.getElementById('acceptedAnswers').value.split('\n').map(l => l.trim()).filter(Boolean)
    if (!q || accepted.length === 0) { showToast('Renseignez la question et au moins une réponse acceptée.'); return }
    obj = { type: 'text', question: q, accepted, fuzzy: document.getElementById('fuzzyMatch').checked, image: currentImageB64 || null }
  } else {
    const a = document.getElementById('ansA').value.trim()
    const b = document.getElementById('ansB').value.trim()
    const c = document.getElementById('ansC').value.trim()
    const d = document.getElementById('ansD').value.trim()
    const correct = document.getElementById('correctAnswer').value
    if (!q || !a || !b || !c || !d) { showToast('Remplissez tous les champs.'); return }
    obj = { question: q, answers: [a, b, c, d], correct, image: currentImageB64 || null }
  }

  if (editingQIndex !== null) {
    questions[editingQIndex] = obj
    editingQIndex = null
  } else {
    questions.push(obj)
  }
  renderQuestionList()
  saveQuestionsToDB()
  clearEditor()
  showToast('Question enregistrée !')
}

function deleteQuestion(i, e) {
  e.stopPropagation()
  questions.splice(i, 1)
  if (currentQIndex >= questions.length) currentQIndex = questions.length - 1
  renderQuestionList()
  saveQuestionsToDB()
}

function editQuestion(i) {
  const q = questions[i]
  editingQIndex = i
  document.getElementById('inputQuestion').value = q.question
  if (isTextQuestion(q)) {
    document.getElementById('questionType').value = 'text'
    document.getElementById('acceptedAnswers').value = q.accepted.join('\n')
    document.getElementById('fuzzyMatch').checked = q.fuzzy !== false
  } else {
    document.getElementById('questionType').value = 'qcm'
    document.getElementById('ansA').value = q.answers[0]
    document.getElementById('ansB').value = q.answers[1]
    document.getElementById('ansC').value = q.answers[2]
    document.getElementById('ansD').value = q.answers[3]
    document.getElementById('correctAnswer').value = q.correct
  }
  updateTypeFields()
  document.getElementById('editingIndex').textContent = i + 1
  if (q.image) {
    currentImageB64 = q.image
    document.getElementById('imagePreview').src = q.image
    document.getElementById('imagePreview').style.display = 'block'
    document.getElementById('uploadHint').style.display = 'none'
    document.getElementById('clearImgBtn').style.display = 'inline-block'
  } else {
    clearImage()
  }
  updateCorrectHighlight()
}

function clearEditor() {
  document.getElementById('inputQuestion').value = ''
  document.getElementById('ansA').value = ''
  document.getElementById('ansB').value = ''
  document.getElementById('ansC').value = ''
  document.getElementById('ansD').value = ''
  document.getElementById('correctAnswer').value = 'A'
  document.getElementById('acceptedAnswers').value = ''
  document.getElementById('fuzzyMatch').checked = true
  document.getElementById('editingIndex').textContent = '—'
  editingQIndex = null
  clearImage()
  updateCorrectHighlight()
}

async function resetAllQuestions() {
  if (!window.confirm('Effacer toutes les questions et préparer une nouvelle partie ?')) return
  questions = []
  currentQIndex = -1
  editingQIndex = null
  answerOrder = []
  answerRevealed = false
  firstPlayerConnected = false
  clearEditor()
  await saveQuestionsToDB()
  renderQuestionList()
  showToast('Questions réinitialisées.')
}

function exportQuestions() {
  if (questions.length === 0) { showToast('Aucune question à exporter.'); return }
  const blob = new Blob([JSON.stringify(questions, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `quiz-questions-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function importQuestions(event) {
  const file = event.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result)
      if (!Array.isArray(imported)) throw new Error()
      const valid = imported.filter(isValidQuestion)
      if (valid.length === 0) throw new Error()
      questions = questions.concat(valid)
      saveQuestionsToDB()
      renderQuestionList()
      showToast(`${valid.length} question(s) importée(s).`)
    } catch (err) {
      showToast('Fichier JSON invalide.')
    }
  }
  reader.readAsText(file)
  event.target.value = ''
}

// ===== IMAGE =====
function handleImageUpload(event) {
  const file = event.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (e) => {
    currentImageB64 = e.target.result
    document.getElementById('imagePreview').src = currentImageB64
    document.getElementById('imagePreview').style.display = 'block'
    document.getElementById('uploadHint').style.display = 'none'
    document.getElementById('clearImgBtn').style.display = 'inline-block'
  }
  reader.readAsDataURL(file)
}

function clearImage() {
  currentImageB64 = null
  document.getElementById('imagePreview').src = ''
  document.getElementById('imagePreview').style.display = 'none'
  document.getElementById('uploadHint').style.display = 'block'
  document.getElementById('clearImgBtn').style.display = 'none'
  document.getElementById('imageInput').value = ''
}

function updateCorrectHighlight() {
  const v = document.getElementById('correctAnswer').value
  ;['A', 'B', 'C', 'D'].forEach(l => {
    document.getElementById('field-' + l).classList.toggle('correct-field', l === v)
  })
}

// ===== GAME FLOW =====
function updateNextButtonState() {
  const btnNext = document.getElementById('btnNext')
  btnNext.disabled = !answerRevealed
  btnNext.classList.remove('btn-gold', 'btn-outline')
  btnNext.classList.add(answerRevealed ? 'btn-gold' : 'btn-outline')
}

function sendCurrentQuestion() {
  if (questions.length === 0) { showToast('Ajoutez au moins une question.'); return }
  if (phase === 'question') { showToast('Une question est déjà en cours.'); return }

  currentQIndex++
  if (currentQIndex >= questions.length) {
    showToast('Toutes les questions ont été envoyées !')
    showScoreboard(true)
    return
  }

  phase = 'question'
  answerRevealed = false
  answerOrder = []
  Object.values(players).forEach(p => p.answered = false)

  Object.values(players).forEach(p => p.attempts = 0)
  broadcast(questionMessage())

  renderPlayers()
  renderLiveQuestion(false)
  updateProgress()
  updatePhaseUI()
  updateEditorVisibility()
  document.getElementById('btnReveal').disabled = false
  document.getElementById('btnNext').textContent = (currentQIndex + 1 < questions.length) ? '▶ Question suivante' : '🏆 Terminer'
  document.getElementById('btnScoreboard').disabled = false
  updateNextButtonState()
  playSound('question.mp3')
  renderQuestionList()
}

function revealAnswer() {
  if (phase !== 'question') return
  phase = 'reveal'
  answerRevealed = true
  const q = currentQuestion()
  broadcast(isTextQuestion(q) ? { type: 'reveal', kind: 'text', answer: q.accepted[0] } : { type: 'reveal', correct: q.correct })
  renderLiveQuestion(true)
  updatePhaseUI()
  document.getElementById('btnReveal').disabled = true
  updateNextButtonState()
}

function endGame() {
  broadcast({ type: 'end' })
  hideScoreboard()
  showToast('Quiz terminé ! Merci à tous.')
  updateEditorVisibility()
}

// ===== RENDER =====
function renderPlayers() {
  const list = document.getElementById('playersList')
  const sorted = Object.entries(players).sort((a, b) => b[1].score - a[1].score)
  document.getElementById('playerCount').textContent = sorted.length
  if (sorted.length === 0) {
    list.innerHTML = '<div style="color:var(--silver);font-size:13px">En attente de joueurs...</div>'
    return
  }
  list.innerHTML = sorted.map(([, p], i) => `
    <div class="player-item ${p.answered ? 'answered' : ''}">
      <span class="player-rank">${i + 1}.</span>
      <span class="player-name">${escHtml(p.name)}</span>
      <span class="player-score">${p.score} <span style="font-size:10px;color:var(--silver);font-family:Barlow,sans-serif">pts</span></span>
    </div>
  `).join('')
}

function renderQuestionList() {
  const list = document.getElementById('questionList')
  document.getElementById('totalQ').textContent = questions.length
  if (questions.length === 0) {
    list.innerHTML = '<div style="color:var(--silver);font-size:13px">Aucune question. Créez-en une ci-dessus.</div>'
    return
  }
  list.innerHTML = questions.map((q, i) => `
    <div class="q-item ${i === currentQIndex ? 'sent active' : i < currentQIndex ? 'sent' : ''}" data-index="${i}">
      <span class="q-num">${i + 1}</span>
      <span class="q-text">${escHtml(q.question)}</span>
      ${isTextQuestion(q) ? '<span title="Réponse libre" style="color:var(--gold);font-size:11px">✍</span>' : ''}
      ${q.image ? '<span title="Avec image" style="color:var(--gold);font-size:11px">🖼</span>' : ''}
      <span class="q-del" data-index="${i}">✕</span>
    </div>
  `).join('')
}

function renderLiveQuestion(showCorrect) {
  const q = currentQuestion()
  const el = document.getElementById('liveQuestion')
  el.classList.add('show')
  document.getElementById('liveQText').textContent = q.question
  const img = document.getElementById('liveQImage')
  if (q.image) { img.src = q.image; img.style.display = 'block' } else { img.style.display = 'none' }
  const letters = ['A', 'B', 'C', 'D']
  if (isTextQuestion(q)) {
    document.getElementById('liveAnswers').innerHTML = `
      <div class="live-answer live-answer-text ${showCorrect ? 'correct' : ''}">
        <span>${showCorrect ? escHtml(q.accepted[0]) : '✍ Réponse libre'}</span>
      </div>
    `
    return
  }
  document.getElementById('liveAnswers').innerHTML = q.answers.map((a, i) => `
    <div class="live-answer ${showCorrect && letters[i] === q.correct ? 'correct' : ''}">
      <span class="live-answer-letter">${letters[i]}</span>
      <span>${escHtml(a)}</span>
    </div>
  `).join('')
}

function updateProgress() {
  const total = Object.keys(players).length
  const answered = Object.values(players).filter(p => p.answered).length
  document.getElementById('answerCountLabel').textContent = `${answered} / ${total}`
  document.getElementById('progressFill').style.width = total > 0 ? `${(answered / total) * 100}%` : '0%'
}

function updatePhaseUI() {
  const badge = document.getElementById('phaseBadge')
  badge.className = 'phase-badge'
  if (phase === 'lobby') { badge.classList.add('phase-lobby'); badge.textContent = 'Lobby' }
  else if (phase === 'question') { badge.classList.add('phase-question'); badge.textContent = `Q${currentQIndex + 1} — En cours` }
  else if (phase === 'reveal') { badge.classList.add('phase-results'); badge.textContent = 'Réponse révélée' }
}

// ===== SCOREBOARD =====
function showScoreboard(isFinal) {
  const sorted = Object.entries(players).sort((a, b) => b[1].score - a[1].score)
  const ranks = ['🥇', '🥈', '🥉']
  document.getElementById('scoreTitle').textContent = isFinal ? '🏆 Classement Final' : `Classement — Q${currentQIndex + 1}`
  document.getElementById('scoreList').innerHTML = sorted.map(([, p], i) => `
    <div class="score-row">
      <span class="rank-badge rank-${i + 1}">${ranks[i] || (i + 1)}</span>
      <span class="score-name">${escHtml(p.name)}</span>
      <span class="score-pts">${p.score} <span>pts</span></span>
    </div>
  `).join('')
  document.getElementById('btnEndGame').style.display = isFinal ? 'inline-block' : 'none'
  document.getElementById('scoreModal').classList.add('show')
  if (isFinal) broadcast({ type: 'finalScores', scores: sorted.map(([, p], i) => ({ name: p.name, score: p.score, rank: i + 1 })) })
}

function hideScoreboard() {
  document.getElementById('scoreModal').classList.remove('show')
  if (phase === 'reveal') { phase = 'lobby'; answerRevealed = false; updatePhaseUI(); updateEditorVisibility() }
}

function updateEditorVisibility() {
  const editor = document.getElementById('editorPanel')
  const questionListDetails = document.getElementById('questionListDetails')
  const isQuizActive = phase === 'question' || phase === 'reveal'
  editor.style.display = isQuizActive ? 'none' : 'block'
  questionListDetails.style.display = isQuizActive ? 'none' : 'block'
  if (!isQuizActive) questionListDetails.open = false
}

// ===== UTILS =====
function playSound(filename) {
  const audio = new Audio(`/audio/${filename}`)
  audio.play().catch(e => console.log('Audio play failed:', e))
}

function showToast(msg) {
  const t = document.getElementById('toast')
  t.textContent = msg
  t.classList.add('show')
  setTimeout(() => t.classList.remove('show'), 3000)
}
function escHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

// ===== EVENT LISTENERS =====
document.getElementById('btnNext').addEventListener('click', sendCurrentQuestion)
document.getElementById('btnReveal').addEventListener('click', revealAnswer)
let bafouillePlayed = -1
document.getElementById('btnReveal').addEventListener('mouseenter', () => {
  if (bafouillePlayed === currentQIndex) return
  if (Math.random() < 0.25) {
    bafouillePlayed = currentQIndex
    playSound('cest-votre-ultime-bafouille.mp3')
  }
})
document.getElementById('btnScoreboard').addEventListener('click', () => showScoreboard(false))
document.getElementById('btnNew').addEventListener('click', clearEditor)
document.getElementById('btnSave').addEventListener('click', saveQuestion)
document.getElementById('btnClear').addEventListener('click', clearEditor)
document.getElementById('btnCloseScore').addEventListener('click', hideScoreboard)
document.getElementById('btnEndGame').addEventListener('click', endGame)
document.getElementById('imageInput').addEventListener('change', handleImageUpload)
document.getElementById('clearImgBtn').addEventListener('click', (e) => { e.stopPropagation(); clearImage() })
document.getElementById('correctAnswer').addEventListener('change', updateCorrectHighlight)
document.getElementById('questionType').addEventListener('change', updateTypeFields)
document.getElementById('btnResetAll').addEventListener('click', resetAllQuestions)
document.getElementById('btnExport').addEventListener('click', exportQuestions)
document.getElementById('btnImport').addEventListener('click', () => document.getElementById('importInput').click())
document.getElementById('importInput').addEventListener('change', importQuestions)

const btnFs = document.getElementById('btnFullscreen')
btnFs.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen()
  } else {
    document.exitFullscreen()
  }
})
document.addEventListener('fullscreenchange', () => {
  btnFs.textContent = document.fullscreenElement ? '⛶' : '⛶'
  btnFs.title = document.fullscreenElement ? 'Quitter le plein écran' : 'Plein écran'
})

// Event delegation for dynamically generated question list items
document.getElementById('questionList').addEventListener('click', (e) => {
  const delBtn = e.target.closest('.q-del')
  const item = e.target.closest('.q-item')
  if (delBtn) {
    deleteQuestion(parseInt(delBtn.dataset.index), e)
  } else if (item) {
    editQuestion(parseInt(item.dataset.index))
  }
})

// ===== INIT =====
updateCorrectHighlight()
updateTypeFields()
initPeer()
loadQuestionsFromDB().then(qs => {
  questions = qs
  renderQuestionList()
})
renderPlayers()
updatePhaseUI()
updateEditorVisibility()
