import './styles/player.css'
import Peer from 'peerjs'

// ===== STATE =====
let peer = null
let conn = null
let myName = ''
let myScore = 0
let myPeerId = null
let hasAnswered = false
let awaitingResult = false

// ===== URL PARAMS =====
const urlParams = new URLSearchParams(window.location.search)
const roomFromUrl = urlParams.get('room')
if (roomFromUrl) {
  document.getElementById('inputRoomId').value = roomFromUrl
}

// ===== INIT =====
function initPeer(callback) {
  peer = new Peer({
    host: '0.peerjs.com',
    port: 443,
    path: '/',
    secure: true,
    debug: 0
  })
  peer.on('open', (id) => {
    myPeerId = id
    setConnBar('connected')
    callback()
  })
  peer.on('error', (e) => {
    setConnBar('error')
    const msg = e.type === 'peer-unavailable'
      ? "Salle introuvable. Vérifiez le code et que l'hôte est bien connecté."
      : 'Erreur : ' + e.type
    showStatus(msg, true)
    document.getElementById('btnJoin').disabled = false
  })
}

function joinGame() {
  const name = document.getElementById('inputName').value.trim()
  // Do NOT uppercase — PeerJS room IDs are case-sensitive and stored lowercase
  const roomId = document.getElementById('inputRoomId').value.trim().toLowerCase()

  if (!name) { showStatus('Entrez votre prénom.', true); return }
  if (!roomId) { showStatus('Entrez le code de la salle.', true); return }

  myName = name
  document.getElementById('btnJoin').disabled = true
  showStatus('Connexion en cours...')
  setConnBar('connecting')

  if (!peer || peer.destroyed) {
    initPeer(() => connectToHost(roomId))
  } else if (!peer.open) {
    peer.once('open', () => connectToHost(roomId))
  } else {
    connectToHost(roomId)
  }
}

function connectToHost(roomId) {
  conn = peer.connect(roomId, { reliable: true })

  conn.on('open', () => {
    setConnBar('connected')
    conn.send({ type: 'join', name: myName })
  })

  conn.on('data', handleMessage)

  conn.on('error', (e) => {
    setConnBar('error')
    showStatus('Erreur de connexion : ' + e.type, true)
    document.getElementById('btnJoin').disabled = false
  })

  conn.on('close', () => {
    setConnBar('error')
  })
  // peer-unavailable is caught by peer.on('error') above — no extra timeout needed
}

// ===== MESSAGES =====
function handleMessage(data) {
  switch (data.type) {
    case 'joined':
      document.getElementById('lobbyName').textContent = myName
      document.getElementById('lobbyScore').textContent = myScore
      showScreen('screenLobby')
      break

    case 'lobby':
      showScreen('screenLobby')
      break

    case 'question':
      hasAnswered = false
      awaitingResult = false
      showQuestion(data)
      break

    case 'result':
      showResult(data)
      break

    case 'reveal':
      if (data.kind === 'text') revealTextAnswer(data.answer)
      else revealAnswers(data.correct)
      break

    case 'finalScores':
      showFinalScreen(data.scores)
      break

    case 'end':
      if (!document.getElementById('screenFinal').classList.contains('active')) {
        showScreen('screenFinal')
        document.getElementById('finalPodium').innerHTML = `
          <div class="final-title">Quiz terminé !</div>
          <div class="final-subtitle">Merci d'avoir participé.</div>
          <div class="final-my-result">Votre score final<br><strong>${myScore}</strong><br><span>points</span></div>
        `
      }
      break
  }
}

// ===== QUESTION =====
function showQuestion(data) {
  hideResultOverlay()
  const letters = ['A', 'B', 'C', 'D']
  document.getElementById('qNumber').textContent = `Question ${data.index + 1}`
  document.getElementById('qScore').textContent = myScore
  document.getElementById('questionText').textContent = data.question

  const img = document.getElementById('questionImage')
  if (data.image) {
    img.src = data.image
    img.style.display = 'block'
  } else {
    img.style.display = 'none'
  }

  const container = document.getElementById('answersContainer')
  const textForm = document.getElementById('textAnswer')

  if (data.kind === 'text') {
    container.innerHTML = ''
    container.hidden = true
    const input = document.getElementById('textInput')
    input.value = ''
    input.maxLength = data.maxLength || 200
    setTextFormEnabled(true)
    setTextFeedback(data.maxAttempts > 1 ? `${data.maxAttempts} essais possibles` : '')
    textForm.hidden = false
    showScreen('screenQuestion')
    input.focus()
    return
  }

  textForm.hidden = true
  container.hidden = false
  container.innerHTML = data.answers.map((ans, i) => `
    <button class="answer-btn" id="btn${letters[i]}" data-letter="${letters[i]}">
      <span class="answer-letter">${letters[i]}</span>
      <span class="answer-text">${escHtml(ans)}</span>
    </button>
  `).join('')

  showScreen('screenQuestion')
}

function submitAnswer(letter, btn) {
  if (hasAnswered) return
  hasAnswered = true

  ;['A', 'B', 'C', 'D'].forEach(l => {
    const b = document.getElementById('btn' + l)
    if (b) {
      b.disabled = true
      if (l !== letter) b.classList.add('dimmed')
    }
  })
  btn.classList.add('selected')
  btn.classList.remove('dimmed')

  if (conn && conn.open) {
    conn.send({ type: 'answer', answer: letter })
  }
}

function setTextFormEnabled(enabled) {
  document.getElementById('textInput').disabled = !enabled
  document.getElementById('btnSendText').disabled = !enabled
}

function setTextFeedback(msg, cls = '') {
  const el = document.getElementById('textFeedback')
  el.textContent = msg
  el.className = 'text-feedback ' + cls
}

function submitText() {
  if (hasAnswered || awaitingResult) return
  const input = document.getElementById('textInput')
  const text = input.value.trim()
  if (!text) return
  if (conn && conn.open) {
    awaitingResult = true
    setTextFormEnabled(false)
    conn.send({ type: 'answer', text })
  }
}

// ===== RESULT =====
function showResult(data) {
  if (data.retry) {
    awaitingResult = false
    setTextFormEnabled(true)
    const input = document.getElementById('textInput')
    setTextFeedback(`Ce n'est pas ça… encore ${data.attemptsLeft} essai${data.attemptsLeft > 1 ? 's' : ''}`, 'wrong')
    input.select()
    input.focus()
    return
  }
  hasAnswered = true
  awaitingResult = false
  setTextFormEnabled(false)
  myScore = data.score
  document.getElementById('qScore').textContent = myScore
  document.getElementById('lobbyScore').textContent = myScore

  if (data.correct) {
    const rankLabels = ['1er', '2e', '3e', '4e+']
    const rankIdx = Math.min(data.rank - 1, rankLabels.length - 1)
    document.getElementById('resultIcon').textContent = data.rank === 1 ? '⚡' : '✅'
    document.getElementById('resultLabel').textContent = 'Bonne réponse !'
    document.getElementById('resultLabel').className = 'result-label correct'
    document.getElementById('resultRank').textContent = `${rankLabels[rankIdx]} à répondre`
    document.getElementById('resultPts').textContent = '+' + data.pts
  } else {
    document.getElementById('resultIcon').textContent = '❌'
    document.getElementById('resultLabel').textContent = 'Mauvaise réponse'
    document.getElementById('resultLabel').className = 'result-label wrong'
    document.getElementById('resultRank').textContent = ''
    document.getElementById('resultPts').textContent = '+0'
  }
  document.getElementById('resultTotal').textContent = myScore
  document.getElementById('resultOverlay').classList.add('show')
}

function hideResultOverlay() {
  document.getElementById('resultOverlay').classList.remove('show')
}

function revealAnswers(correctLetter) {
  hideResultOverlay()
  ;['A', 'B', 'C', 'D'].forEach(l => {
    const btn = document.getElementById('btn' + l)
    if (!btn) return
    btn.disabled = true
    btn.classList.remove('dimmed', 'selected')
    if (l === correctLetter) {
      btn.classList.add('correct')
    } else {
      btn.classList.add('dimmed')
    }
  })
}

function revealTextAnswer(answer) {
  hideResultOverlay()
  hasAnswered = true
  setTextFormEnabled(false)
  setTextFeedback('Réponse : ' + answer, 'correct')
}

// ===== FINAL =====
function showFinalScreen(scores) {
  hideResultOverlay()
  const rankIcons = ['🥇', '🥈', '🥉']
  const myRank = scores.findIndex(s => s.name === myName)

  let html = `
    <div class="final-title">🏆 Classement Final</div>
    <div class="final-subtitle">Merci d'avoir joué !</div>
  `

  scores.forEach((s, i) => {
    const isMe = s.name === myName
    html += `
      <div class="final-rank-row ${isMe ? 'me' : ''}">
        <span class="final-rank-icon">${rankIcons[i] || (i + 1)}</span>
        <span class="final-rank-name">${escHtml(s.name)}${isMe ? ' (vous)' : ''}</span>
        <span class="final-rank-pts">${s.score} pts</span>
      </div>
    `
  })

  if (myRank >= 0) {
    html += `
      <div class="final-my-result">
        Votre score final<br><strong>${myScore}</strong><br>
        <span style="font-size:13px">Position ${myRank + 1}/${scores.length}</span>
      </div>
    `
  }

  document.getElementById('finalPodium').innerHTML = html
  showScreen('screenFinal')
}

// ===== UTILS =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'))
  document.getElementById(id).classList.add('active')
}

function showStatus(msg, isError) {
  const el = document.getElementById('connectStatus')
  el.textContent = msg
  el.style.color = isError ? '#ff4757' : '#c8d0e0'
}

function setConnBar(state) {
  document.getElementById('connBar').className = 'conn-bar ' + state
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ===== EVENT LISTENERS =====
document.getElementById('btnJoin').addEventListener('click', joinGame)

document.getElementById('inputRoomId').addEventListener('input', function () {
  this.value = this.value.trimStart()
})

document.getElementById('inputRoomId').addEventListener('keydown', e => {
  if (e.key === 'Enter') joinGame()
})

document.getElementById('inputName').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('inputRoomId').focus()
})

document.getElementById('textAnswer').addEventListener('submit', (e) => {
  e.preventDefault()
  submitText()
})

// Event delegation for dynamically generated answer buttons
document.getElementById('answersContainer').addEventListener('click', (e) => {
  const btn = e.target.closest('.answer-btn')
  if (btn && !btn.disabled) {
    submitAnswer(btn.dataset.letter, btn)
  }
})
