// Comparaison tolérante des réponses en texte libre

const LEADING_WORDS = new Set([
  'le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd', 'the', 'a', 'an',
  'je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles',
])

// Minuscules, sans accents ni ponctuation, espaces simples, sans article/pronom en tête
export function normalize(text) {
  const tokens = String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
  while (tokens.length > 1 && LEADING_WORDS.has(tokens[0])) tokens.shift()
  return tokens.join(' ')
}

// Distance de Damerau-Levenshtein (une transposition compte pour 1 faute)
function distance(a, b) {
  const rows = a.length + 1
  const cols = b.length + 1
  const d = Array.from({ length: rows }, (_, i) => [i, ...new Array(cols - 1).fill(0)])
  for (let j = 1; j < cols; j++) d[0][j] = j
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[a.length][b.length]
}

// Nombre de fautes tolérées selon la longueur de la réponse attendue
function allowedTypos(expected) {
  if (/^[\d ]+$/.test(expected)) return 0 // jamais de tolérance sur les nombres
  if (expected.length < 5) return 0
  if (expected.length <= 8) return 1
  return 2
}

export function matchesAnswer(input, accepted, fuzzy = true) {
  const given = normalize(input)
  if (!given) return false
  return accepted.some(candidate => {
    const expected = normalize(candidate)
    if (!expected) return false
    if (given === expected) return true
    return fuzzy && distance(given, expected) <= allowedTypos(expected)
  })
}
