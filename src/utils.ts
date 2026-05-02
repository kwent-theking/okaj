import { useEffect, useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// OCR CORRECTION LAYER
//
// Cyberpunk 2077 breach puzzle only ever uses these 6 hex codes:
//   1C  BD  55  E9  FF  7A
// After taking byte[0] we only need to recognise: 1  B  5  E  F  7
//
// This table maps every known Tesseract misread → correct first character.
// Adding new entries here is the main way to "train" the system for new errors.
// ─────────────────────────────────────────────────────────────────────────────

// Direct single-character substitutions
const CHAR_CORRECTIONS: Record<string, string> = {
  // ── '1' (from 1C) ──────────────────────────────────────────────────────────
  // Tesseract often reads the stylised Cyberpunk "1" as a letter
  l: '1',   // lowercase L
  I: '1',   // uppercase i
  i: '1',   // lowercase i
  '|': '1', // pipe
  '!': '1', // exclamation mark
  J: '1',   // rare, but happens with narrow fonts
  j: '1',

  // ── 'B' (from BD) ──────────────────────────────────────────────────────────
  b: 'B',
  '8': 'B', // very common – curved top and bottom
  '6': 'B', // if bottom loop is larger
  '3': 'B', // rare – right-side loops only
  D: 'B',   // single loop misread

  // ── '5' (from 55) ──────────────────────────────────────────────────────────
  S: '5',
  s: '5',
  '$': '5',
  G: '5',   // uncommon but seen at small resolutions
  g: '5',

  // ── 'E' (from E9) ──────────────────────────────────────────────────────────
  e: 'E',
  '3': 'E', // overlaps with B correction — resolved by snap logic below
  F: 'E',   // top two bars without the middle bar → handled in snap too

  // ── 'F' (from FF) ──────────────────────────────────────────────────────────
  f: 'F',
  p: 'F',
  P: 'F',
  r: 'F',   // small caps
  R: 'F',   // large caps with extra leg trimmed

  // ── '7' (from 7A) ──────────────────────────────────────────────────────────
  '/': '7',
  T: '7',
  t: '7',
  Z: '7',   // slash with serifs
  z: '7',
  '?': '7',
  Y: '7',   // wide top
}

// Full known tokens (both chars) that Tesseract returns as a single blob
// e.g. "1C" squished → "lC", "IC", "BD" → "8D", "BD" → "Bo", etc.
// Maps full 2-char token → correct first char
const TOKEN_CORRECTIONS: Record<string, string> = {
  // 1C variants
  lC: '1', IC: '1', iC: '1', '1c': '1', Ic: '1', lc: '1',
  // BD variants
  '8D': 'B', '8d': 'B', BD: 'B', Bd: 'B', bD: 'B', bd: 'B',
  '6D': 'B', Bo: 'B', B0: 'B',
  // 55 variants
  SS: '5', ss: '5', S5: '5', '5S': '5', Ss: '5',
  GG: '5', G5: '5', '5G': '5',
  // E9 variants
  E9: 'E', e9: 'E', '39': 'E', Eg: 'E', EG: 'E', eq: 'E', EQ: 'E',
  // FF variants
  FF: 'F', Ff: 'F', fF: 'F', ff: 'F', FP: 'F', fp: 'F', pF: 'F',
  // 7A variants
  '7a': '7', '7A': '7', TA: '7', Ta: '7', ZA: '7', Za: '7',
}

// The only valid first-chars in any breach matrix
const VALID_CHARS = new Set(['1', 'B', '5', 'E', 'F', '7'])

// Levenshtein distance (cheap, max-length 1 char)
// Used as last-resort: pick the valid char whose visual "distance" is smallest
// We define this by a hand-tuned similarity score (lower = more similar)
const VISUAL_DISTANCE: Record<string, Record<string, number>> = {
  // how far each misread char is from each valid char
  '1': { l: 0, I: 0, i: 1, '|': 1, '!': 2, J: 2, j: 2 },
  B: { b: 0, '8': 1, '6': 2, D: 2 },
  '5': { S: 0, s: 0, '$': 1, G: 2, g: 2 },
  E: { e: 0, '3': 1, F: 2 },
  F: { f: 0, p: 1, P: 1, r: 2, R: 2 },
  '7': { '/': 0, T: 1, t: 1, Z: 2, z: 2, '?': 2, Y: 2 },
}

function snapToValid(char: string): string {
  // Already valid
  if (VALID_CHARS.has(char)) return char

  // Direct correction table
  const direct = CHAR_CORRECTIONS[char]
  if (direct && VALID_CHARS.has(direct)) return direct

  // Visual distance fallback – find the valid char this looks most like
  let best = char
  let bestScore = Infinity
  for (const valid of VALID_CHARS) {
    const score = VISUAL_DISTANCE[valid]?.[char] ?? Infinity
    if (score < bestScore) {
      bestScore = score
      best = valid
    }
  }
  // Only snap if we found a confident match (distance < 3)
  return bestScore < 3 ? best : char
}

function parseToken(token: string): string {
  // 1. Check full-token correction table (e.g. "8D" → 'B')
  const fullMatch = TOKEN_CORRECTIONS[token]
  if (fullMatch) return fullMatch

  // 2. Snap first character
  return snapToValid(token[0])
}

const parseLine = (line: string) =>
  line
    .split(' ')
    .filter(Boolean)
    .map(parseToken)

// ─────────────────────────────────────────────────────────────────────────────

export function getMostCommonLength<T>(lines: T[][]) {
  const lengths: Record<number, number> = {}
  lines.forEach(line => {
    lengths[line.length] = lengths[line.length] || 0
    lengths[line.length]++
  })
  return parseInt(
    Object.entries(lengths).sort((a, b) => b[1] - a[1])[0]?.[0] || '0',
    10
  )
}

export function processMatrix(res: string) {
  const lines = res
    .split('\n')
    .map(parseLine)
    .filter(bytes => bytes.length)
  const mostCommonLength = getMostCommonLength(lines)
  const validLines = lines.filter(line => line.length === mostCommonLength)
  const chars = new Set<string>()
  validLines.forEach(bytes => {
    bytes.forEach(byte => {
      chars.add(byte)
    })
  })

  return { lines: validLines, chars }
}

export const processTargets = (res: string, matrixBytes: Set<string>) =>
  res
    .split('\n')
    .map(parseLine)
    .filter(
      bytes =>
        bytes.length >= 2 &&
        bytes.length <= 5 &&
        bytes.every(byte => matrixBytes.has(byte))
    )

export function useStorage(storageKey: string, initialState?: any) {
  const storedValue = window.localStorage.getItem(storageKey) || initialState
  const [state, setState] = useState(storedValue)
  useEffect(() => {
    window.localStorage.setItem(storageKey, state)
  }, [state])

  return [state, setState] as const
}

/**
 * Turn the photo into a "black text on white background" image.
 */
export function threshold(
  context: CanvasRenderingContext2D,
  screenshot: boolean = false
) {
  const { width, height } = context.canvas
  const resolution = width * height
  const imageData = context.getImageData(0, 0, width, height)
  const { data } = imageData
  let cutAt = 128

  // 1. Convert to grayscale and build histogram (always, for both camera and screenshot)
  const histo = Array(256).fill(0)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.round(
      data[i] * 0.7 + data[i + 1] * 0.2 + data[i + 2] * 0.1
    )
    histo[data[i]]++
  }

  if (!screenshot) {
    // 2. Cut off the top 1% bright and top 1% dark region
    const capThreshold = 0.01
    let minCap = 0
    let minAccu = 0
    for (let i = 0; i < 256; i++) {
      minAccu += histo[i] || 0
      if (minAccu > resolution * capThreshold) {
        minCap = i
        break
      }
    }

    let maxCap = 0
    let maxAccu = 0
    for (let i = 255; i >= 0; i--) {
      maxAccu += histo[i] || 0
      if (maxAccu > resolution * capThreshold) {
        maxCap = i
        break
      }
    }

    // 3. Search 65%-90% brightness range for the histogram valley
    let minHistValue = Infinity
    const range = maxCap - minCap
    const start = minCap + Math.floor(range * 0.65)
    const end = minCap + range * 0.9
    for (let i = start; i <= end; i++) {
      if (histo[i] < minHistValue) {
        minHistValue = histo[i]
        cutAt = i
      }
    }
  } else {
    // For screenshots: Cyberpunk has dark background + bright colored text.
    // Find the valley between the two histogram peaks in the 30-90% range.
    let minHistValue = Infinity
    const start = Math.floor(256 * 0.3)
    const end = Math.floor(256 * 0.9)
    for (let i = start; i <= end; i++) {
      if (histo[i] < minHistValue) {
        minHistValue = histo[i]
        cutAt = i
      }
    }
  }

  // 4. Threshold the image.
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i] > cutAt ? 0 : 255
    data[i] = v
    data[i + 1] = v
    data[i + 2] = v
  }

  context.putImageData(imageData, 0, 0)
}
