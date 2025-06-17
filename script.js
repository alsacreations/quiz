
// Fichier source contenant les questions/réponses
const quizFile = 'cookies.json';

// Function précédentes et setup du confetti
function fireConfetti() {
    const duration = 3000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0, colors: ['#00ff95', '#0aff', '#6B4CF5', '#ff477e', '#fff'] };

    function randomInRange(min, max) {
        return Math.random() * (max - min) + min;
    }

    const interval = setInterval(function () {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
            return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);

        confetti(Object.assign({}, defaults, {
            particleCount,
            origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
        }));
        confetti(Object.assign({}, defaults, {
            particleCount,
            origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
        }));
    }, 250);
}

const quizData = {}

// Charger les données du quiz depuis le fichier JSON
fetch(quizFile)
    .then(response => response.json())
    .then(data => {
        quizData.questions = data.questions;
        document.getElementById('deco').textContent = data.deco;
        document.title += ' : ' + data.title;
        /*document.querySelector('.intro-container').style.display = 'none';
        document.querySelector('#question-container').style.display = 'block';
        document.querySelector('#navigation').style.display = 'flex';
        displayQuestion();*/
    })
    .catch(error => console.error('Error loading quiz data:', error));

let currentQuestion = -1;
let answeredQuestions = new Set();
let score = 0;

function updateScore() {
    document.getElementById('current-score').textContent = score;
    document.getElementById('total-questions').textContent = quizData.questions.length;
}

function showFinalScore() {
    const finalScoreDiv = document.getElementById('final-score');
    const successRate = (score / quizData.questions.length) * 100;

    document.getElementById('final-score-value').textContent = score;
    document.getElementById('final-total-questions').textContent = quizData.questions.length;
    // document.getElementById('success-rate').textContent = successRate.toFixed(1);
    document.body.classList.add('final');

    finalScoreDiv.style.display = 'block';

    if (successRate === 100) {
        fireConfetti();
    }
}

function displayQuestion() {
    const question = quizData.questions[currentQuestion];
    document.getElementById('question-number').textContent = `Question ${currentQuestion + 1}/${quizData.questions.length}`;
    document.getElementById('question-text').textContent = question.question;

    const optionsContainer = document.getElementById('options');
    optionsContainer.innerHTML = '';
    optionsContainer.classList.add('hidden');

    document.getElementById('showChoices').classList.remove('hidden');

    question.options.forEach((option, index) => {
        const button = document.createElement('button');
        button.className = 'option';
        button.textContent = option;
        button.onclick = () => checkAnswer(index);
        optionsContainer.appendChild(button);
    })

    const feedback = document.getElementById('feedback');
    const explanation = document.getElementById('explanation');
    feedback.classList.add('hidden');
    explanation.style.display = 'none';

    // Cacher le score final lors du passage entre les questions
    document.getElementById('final-score').style.display = 'none';

    updateNavigationButtons();
    updateScore();
}

function checkAnswer(selectedIndex) {
    if (answeredQuestions.has(currentQuestion)) return;

    const question = quizData.questions[currentQuestion];
    const options = document.querySelectorAll('.option');
    const feedback = document.getElementById('feedback');
    const explanation = document.getElementById('explanation');
    const isCorrect = selectedIndex === (question.correctAnswer - 1);

    if (isCorrect) {
        score++;
        updateScore();
    }

    // Affiche le statut correct/incorrect de la réponse choisie
    options[selectedIndex].classList.add(
        isCorrect ? 'correct' : 'incorrect'
    );
    // Affiche le statut correct de la bonne réponse
    options[question.correctAnswer - 1].classList.add('correct');

    // Afficher le feedback
    feedback.classList.remove('hidden');
    feedback.style.backgroundColor = isCorrect ? '#00925f' : '#93304a';
    feedback.textContent = isCorrect ?
        '🎉 Bonne réponse ! 🎉' :
        '❌ Mauvaise réponse' //  La bonne réponse était : ' + question.options[question.correctAnswer];

    // Afficher l'explication
    explanation.style.display = 'block';
    explanation.textContent = question.explanation;

    if (isCorrect) {
        fireConfetti();
    }

    answeredQuestions.add(currentQuestion);

    // Afficher le score final si c'est la dernière question
    if (answeredQuestions.size === quizData.questions.length) {
        setTimeout(showFinalScore, 2000);
    }
}

function updateNavigationButtons() {
    document.getElementById('prev-button').disabled = currentQuestion === 0;
    document.getElementById('next-button').disabled = currentQuestion === quizData.questions.length - 1;
}

// Bouton démarrage
document.getElementById('go').onclick = () => {
    currentQuestion = 0;
    document.querySelector('#question-container').style.display = 'block';
    document.querySelector('#navigation').style.display = 'flex';
    document.querySelector('.intro-container').style.display = 'none';
    // Initialiser le quiz
    displayQuestion();
}

// Bouton montrer les choix
document.getElementById('showChoices').onclick = () => {
    document.querySelector('#options').classList.remove('hidden');
    document.getElementById('showChoices').classList.add('hidden');
}

// Bouton précédent
document.getElementById('prev-button').onclick = () => {
    if (currentQuestion > 0) {
        currentQuestion--;
        displayQuestion();
    }
}

// Bouton suivant
document.getElementById('next-button').onclick = () => {
    if (currentQuestion < quizData.questions.length - 1) {
        currentQuestion++;
        displayQuestion();
    }
}
