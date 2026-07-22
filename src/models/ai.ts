import type { Board, Color, Square, Piece, MoveOptions } from './chess'
import {
  getPieceMoves,
  isKingInCheck,
  getEnPassantTarget,
} from './chess'

// ============================================================
// Types
// ============================================================
export type AIDifficulty = 1 | 2 | 3 | 4 | 5
export type AIStyle = 'balanced' | 'aggressive' | 'defensive' | 'unpredictable'

export interface AIDetailedMove {
  fromRow: number
  fromCol: number
  toRow: number
  toCol: number
  special?: 'castle' | 'enPassant'
  rookFrom?: Square
  rookTo?: Square
  promotion?: 'queen' | 'knight' | 'rook' | 'bishop'
}

// ============================================================
// Constants
// ============================================================
const PIECE_VALUES: Record<string, number> = {
  pawn: 100, knight: 320, bishop: 330, rook: 500, queen: 900, king: 20000,
}

const PIECE_TYPE_INDEX: Record<string, number> = {
  pawn: 0, knight: 1, bishop: 2, rook: 3, queen: 4, king: 5,
}

const COLOR_INDEX: Record<string, number> = {
  white: 0, black: 1,
}

function oppositeColor(c: Color): Color {
  return c === 'white' ? 'black' : 'white'
}

const TT_EXACT = 0
const TT_ALPHA = 1
const TT_BETA = 2

const MAX_DEPTH = 64
const TT_SIZE = 1 << 17
const TT_MASK = TT_SIZE - 1

const INF = 1_000_000
const MATE_SCORE = 99999

// ============================================================
// Piece-Square Tables
// ============================================================
const PAWN_TABLE: number[][] = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5, 5, 10, 25, 25, 10, 5, 5],
  [0, 0, 0, 20, 20, 0, 0, 0],
  [5, -5, -10, 0, 0, -10, -5, 5],
  [5, 10, 10, -20, -20, 10, 10, 5],
  [0, 0, 0, 0, 0, 0, 0, 0],
]

const KNIGHT_TABLE: number[][] = [
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20, 0, 0, 0, 0, -20, -40],
  [-30, 0, 10, 15, 15, 10, 0, -30],
  [-30, 5, 15, 20, 20, 15, 5, -30],
  [-30, 0, 15, 20, 20, 15, 0, -30],
  [-30, 5, 10, 15, 15, 10, 5, -30],
  [-40, -20, 0, 5, 5, 0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50],
]

const BISHOP_TABLE: number[][] = [
  [-20, -10, -10, -10, -10, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 10, 10, 5, 0, -10],
  [-10, 5, 5, 10, 10, 5, 5, -10],
  [-10, 0, 10, 10, 10, 10, 0, -10],
  [-10, 10, 10, 10, 10, 10, 10, -10],
  [-10, 5, 0, 0, 0, 0, 5, -10],
  [-20, -10, -10, -10, -10, -10, -10, -20],
]

const ROOK_TABLE: number[][] = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [5, 10, 10, 10, 10, 10, 10, 5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [0, 0, 0, 5, 5, 0, 0, 0],
]

const QUEEN_TABLE: number[][] = [
  [-20, -10, -10, -5, -5, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 5, 5, 5, 0, -10],
  [-5, 0, 5, 5, 5, 5, 0, -5],
  [0, 0, 5, 5, 5, 5, 0, -5],
  [-10, 5, 5, 5, 5, 5, 0, -10],
  [-10, 0, 5, 0, 0, 0, 0, -10],
  [-20, -10, -10, -5, -5, -10, -10, -20],
]

const KING_MIDDLE_TABLE: number[][] = [
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-20, -30, -30, -40, -40, -30, -30, -20],
  [-10, -20, -20, -20, -20, -20, -20, -10],
  [20, 20, 0, 0, 0, 0, 20, 20],
  [20, 30, 10, 0, 0, 10, 30, 20],
]

const KING_ENDGAME_TABLE: number[][] = [
  [-50, -40, -30, -20, -20, -30, -40, -50],
  [-30, -20, -10, 0, 0, -10, -20, -30],
  [-30, -10, 20, 30, 30, 20, -10, -30],
  [-30, -10, 30, 40, 40, 30, -10, -30],
  [-30, -10, 30, 40, 40, 30, -10, -30],
  [-30, -10, 20, 30, 30, 20, -10, -30],
  [-30, -30, 0, 0, 0, 0, -30, -30],
  [-50, -30, -30, -30, -30, -30, -30, -50],
]

// ============================================================
// Zobrist Hashing
// ============================================================
function xorshift32(state: number): () => number {
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return state >>> 0
  }
}
const rng = xorshift32(0xDEADBEEF)

const zobristPiece: number[][][] = Array.from({ length: 6 }, () =>
  Array.from({ length: 2 }, () => new Array(64).fill(0)),
)
const zobristEnPassant: number[] = new Array(8).fill(0)
let zobristBlackToMove = 0
;(function initZobrist() {
  for (let pt = 0; pt < 6; pt++) {
    for (let c = 0; c < 2; c++) {
      for (let sq = 0; sq < 64; sq++) {
        zobristPiece[pt]![c]![sq] = rng()
      }
    }
  }
  for (let f = 0; f < 8; f++) zobristEnPassant[f] = rng()
  zobristBlackToMove = rng()
})()

// ============================================================
// Transposition Table
// ============================================================
interface TTEntry {
  hash: number
  depth: number
  score: number
  flag: number
  bestMove: AIDetailedMove | null
}

const tt: (TTEntry | null)[] = new Array(TT_SIZE).fill(null)
let ttHits = 0

function probeTT(hash: number, depth: number, alpha: number, beta: number): {
  hit: boolean
  score: number
  bestMove: AIDetailedMove | null
} {
  const idx = hash & TT_MASK
  const entry = tt[idx]
  if (entry && entry.hash === hash && entry.depth >= depth) {
    ttHits++
    if (entry.flag === TT_EXACT) return { hit: true, score: entry.score, bestMove: entry.bestMove }
    if (entry.flag === TT_ALPHA && entry.score <= alpha) return { hit: true, score: alpha, bestMove: entry.bestMove }
    if (entry.flag === TT_BETA && entry.score >= beta) return { hit: true, score: beta, bestMove: entry.bestMove }
  }
  return { hit: false, score: 0, bestMove: entry?.bestMove ?? null }
}

function storeTT(hash: number, depth: number, score: number, flag: number, bestMove: AIDetailedMove | null): void {
  const idx = hash & TT_MASK
  const existing = tt[idx]
  if (existing && existing.hash === hash && existing.depth > depth && existing.flag === TT_EXACT) return
  tt[idx] = { hash, depth, score, flag, bestMove }
}

// ============================================================
// Killer Moves & History Table
// ============================================================
const killerMoves: (AIDetailedMove | null)[][] = Array.from({ length: MAX_DEPTH }, () => [null, null])

const historyTable: number[][][][][] = Array.from({ length: 2 }, () =>
  Array.from({ length: 8 }, () =>
    Array.from({ length: 8 }, () =>
      Array.from({ length: 8 }, () => new Array(8).fill(0)),
    ),
  ),
)

function recordKillerMove(move: AIDetailedMove, ply: number): void {
  if (move.special) return
  const to = board[move.toRow]?.[move.toCol]
  if (to) return // don't store captures

  const slot = killerMoves[ply]!
  const killer0 = slot[0]
  if (killer0 && killer0.fromRow === move.fromRow && killer0.fromCol === move.fromCol &&
    killer0.toRow === move.toRow && killer0.toCol === move.toCol) return
  slot[1] = killer0 ?? null
  slot[0] = move
}

function recordHistory(move: AIDetailedMove, depthBonus: number): void {
  if (move.special) return
  const piece = board[move.fromRow]?.[move.fromCol]
  if (!piece) return
  const ci = COLOR_INDEX[piece.color]!
  const histCell = historyTable[ci]![move.fromRow]![move.fromCol]![move.toRow]!
  histCell[move.toCol]! += depthBonus
}

// ============================================================
// Board Change Tracking (Make / Unmake) + Incremental Hash
// ============================================================
interface BoardChange {
  row: number
  col: number
  oldPiece: Piece | null
}

function makeChange(
  b: Board, row: number, col: number,
  newPiece: Piece | null, changes: BoardChange[],
): void {
  changes.push({ row, col, oldPiece: b[row]![col]! })
  b[row]![col] = newPiece
}

interface MakeMoveResult {
  changes: BoardChange[]
  newEpTarget: { row: number; col: number } | null
  oldHash: number
}

/**
 * Execute a move on the global board, updating the global searchHash incrementally.
 * Returns changes for undo and the previous hash.
 */
function makeMove(move: AIDetailedMove, oldEpFile: number | null): MakeMoveResult {
  const changes: BoardChange[] = []
  const piece = board[move.fromRow]![move.fromCol]!
  const fromSq = move.fromRow * 8 + move.fromCol
  const toSq = move.toRow * 8 + move.toCol

  let newEpTarget: { row: number; col: number } | null = null
  let newHash = searchHash
  let wasPromotion = false

  // --- Toggle side to move ---
  newHash ^= zobristBlackToMove

  // --- XOR out old en passant file ---
  if (oldEpFile !== null) newHash ^= zobristEnPassant[oldEpFile]!

  if (move.special === 'castle' && move.rookFrom && move.rookTo) {
    // King
    newHash ^= zobristPiece[PIECE_TYPE_INDEX['king']!]![COLOR_INDEX[piece.color]!]![fromSq]!
    newHash ^= zobristPiece[PIECE_TYPE_INDEX['king']!]![COLOR_INDEX[piece.color]!]![toSq]!
    makeChange(board, move.toRow, move.toCol, { ...piece, hasMoved: true }, changes)
    makeChange(board, move.fromRow, move.fromCol, null, changes)

    // Rook
    const rook = board[move.rookFrom.row]![move.rookFrom.col]!
    const rookFromSq = move.rookFrom.row * 8 + move.rookFrom.col
    const rookToSq = move.rookTo.row * 8 + move.rookTo.col
    newHash ^= zobristPiece[PIECE_TYPE_INDEX['rook']!]![COLOR_INDEX[rook.color]!]![rookFromSq]!
    newHash ^= zobristPiece[PIECE_TYPE_INDEX['rook']!]![COLOR_INDEX[rook.color]!]![rookToSq]!
    makeChange(board, move.rookTo.row, move.rookTo.col, { ...rook, hasMoved: true }, changes)
    makeChange(board, move.rookFrom.row, move.rookFrom.col, null, changes)
  } else if (move.special === 'enPassant') {
    const promotedType = (move.toRow === 0 || move.toRow === 7) ? move.promotion ?? 'queen' : piece.type
    // Remove pawn from source
    newHash ^= zobristPiece[PIECE_TYPE_INDEX['pawn']!]![COLOR_INDEX[piece.color]!]![fromSq]!
    // Add piece at destination
    newHash ^= zobristPiece[PIECE_TYPE_INDEX[promotedType]!]![COLOR_INDEX[piece.color]!]![toSq]!
    // Remove captured pawn
    const capSq = move.fromRow * 8 + move.toCol
    const capturedPawn = board[move.fromRow]![move.toCol]!
    newHash ^= zobristPiece[PIECE_TYPE_INDEX['pawn']!]![COLOR_INDEX[capturedPawn.color]!]![capSq]!

    makeChange(board, move.toRow, move.toCol, { type: promotedType, color: piece.color, hasMoved: true }, changes)
    makeChange(board, move.fromRow, move.fromCol, null, changes)
    makeChange(board, move.fromRow, move.toCol, null, changes)
    wasPromotion = promotedType !== 'pawn'
  } else {
    const isPawn = piece.type === 'pawn'
    const isDoublePush = isPawn && Math.abs(move.toRow - move.fromRow) === 2
    const promotedType = isPawn && (move.toRow === 0 || move.toRow === 7)
      ? move.promotion ?? 'queen'
      : piece.type
    const captured = board[move.toRow]![move.toCol]

    // Remove piece from source
    newHash ^= zobristPiece[PIECE_TYPE_INDEX[piece.type]!]![COLOR_INDEX[piece.color]!]![fromSq]!
    // Add piece at destination
    newHash ^= zobristPiece[PIECE_TYPE_INDEX[promotedType]!]![COLOR_INDEX[piece.color]!]![toSq]!
    // Remove captured piece
    if (captured) {
      newHash ^= zobristPiece[PIECE_TYPE_INDEX[captured.type]!]![COLOR_INDEX[captured.color]!]![toSq]!
    }

    makeChange(board, move.toRow, move.toCol, { type: promotedType, color: piece.color, hasMoved: true }, changes)
    makeChange(board, move.fromRow, move.fromCol, null, changes)

    if (isDoublePush) {
      newEpTarget = { row: (move.fromRow + move.toRow) >> 1, col: move.fromCol }
    }
    wasPromotion = promotedType !== piece.type
  }

  // --- XOR in new en passant file ---
  const newEpFile = newEpTarget ? newEpTarget.col : null
  if (newEpFile !== null) newHash ^= zobristEnPassant[newEpFile]!

  const oldHash = searchHash
  searchHash = newHash >>> 0

  return { changes, newEpTarget, oldHash }
}

/**
 * Undo a move by restoring board changes and the hash.
 */
function unmakeMove(changes: BoardChange[], oldHash: number): void {
  for (let i = changes.length - 1; i >= 0; i--) {
    const ch = changes[i]!
    board[ch.row]![ch.col] = ch.oldPiece
  }
  searchHash = oldHash
}

// ============================================================
// Move Generation (legal moves for a color)
// ============================================================
function generateLegalMoves(
  color: Color,
  epTarget: { row: number; col: number } | null,
  capturesOnly: boolean,
  lastMove: { from: Square; to: Square } | null,
): AIDetailedMove[] {
  const moves: AIDetailedMove[] = []
  const ep = epTarget ?? getEnPassantTarget(lastMove)
  const moveOpts: MoveOptions = { enPassantTarget: ep, lastMove }

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row]![col]
      if (!piece || piece.color !== color) continue

      const candidateMoves = getPieceMoves(board, row, col, moveOpts)
      for (const m of candidateMoves) {
        const isCapture = board[m.row]![m.col] !== null || m.special === 'enPassant'
        if (capturesOnly && !isCapture) continue

        const detailed: AIDetailedMove = {
          fromRow: row, fromCol: col,
          toRow: m.row, toCol: m.col,
          special: m.special,
          rookFrom: m.rookFrom, rookTo: m.rookTo,
        }
        if (piece.type === 'pawn' && (m.row === 0 || m.row === 7)) {
          detailed.promotion = 'queen'
        }

        // Test legality via make/unmake
        const oldEpFile = ep ? ep.col : null
        const { changes, oldHash } = makeMove(detailed, oldEpFile)
        const legal = !isKingInCheck(board, color)
        unmakeMove(changes, oldHash)

        if (legal) moves.push(detailed)
      }
    }
  }
  return moves
}

// ============================================================
// Move Scoring / Ordering
// ============================================================
const MOVE_SCORE_TT = 10_000_000
const MOVE_SCORE_CAPTURE_BASE = 1_000_000
const MOVE_SCORE_KILLER_BASE = 900_000
const MOVE_SCORE_KILLER2 = 800_000

function scoreMoveForOrdering(
  move: AIDetailedMove,
  ttMove: AIDetailedMove | null,
  ply: number,
): number {
  // 1. TT best move
  if (ttMove &&
    ttMove.fromRow === move.fromRow && ttMove.fromCol === move.fromCol &&
    ttMove.toRow === move.toRow && ttMove.toCol === move.toCol &&
    ttMove.special === move.special
  ) return MOVE_SCORE_TT

  // 2. Captures by MVV-LVA
  const victim = move.special === 'enPassant'
    ? board[move.fromRow]![move.toCol]
    : board[move.toRow]![move.toCol]
  if (victim) {
    const attacker = board[move.fromRow]![move.fromCol]
    const victimVal = PIECE_VALUES[victim.type] ?? 0
    const attackerVal = PIECE_VALUES[attacker?.type ?? 'pawn'] ?? 0
    return MOVE_SCORE_CAPTURE_BASE + victimVal * 10 - attackerVal
  }

  // 3. Promotion
  if (move.promotion) return MOVE_SCORE_CAPTURE_BASE + 900

  // 4. Killer moves
  const killer0 = killerMoves[ply]![0]
  if (killer0 &&
    killer0.fromRow === move.fromRow && killer0.fromCol === move.fromCol &&
    killer0.toRow === move.toRow && killer0.toCol === move.toCol
  ) return MOVE_SCORE_KILLER_BASE
  const killer1 = killerMoves[ply]![1]
  if (killer1 &&
    killer1.fromRow === move.fromRow && killer1.fromCol === move.fromCol &&
    killer1.toRow === move.toRow && killer1.toCol === move.toCol
  ) return MOVE_SCORE_KILLER2

  // 5. History heuristic
  const piece = board[move.fromRow]![move.fromCol]
  if (piece && !move.special) {
    const ci = COLOR_INDEX[piece.color]!
    return historyTable[ci]![move.fromRow]![move.fromCol]![move.toRow]![move.toCol] ?? 0
  }
  return 0
}

// ============================================================
// Board Evaluation
// ============================================================
function isEndgame(): boolean {
  let totalMaterial = 0
  let queenCount = 0
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r]![c]
      if (!piece || piece.type === 'king') continue
      totalMaterial += PIECE_VALUES[piece.type] ?? 0
      if (piece.type === 'queen') queenCount++
    }
  }
  return queenCount <= 1 || totalMaterial <= 1400
}

function evaluateBoardInternal(perspective: Color): number {
  let score = 0
  const endgame = isEndgame()

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row]![col]
      if (!piece) continue

      const sign = piece.color === perspective ? 1 : -1
      score += sign * (PIECE_VALUES[piece.type] ?? 0)

      let posValue = 0
      const adjRow = piece.color === 'white' ? row : 7 - row
      const adjCol = piece.color === 'white' ? col : 7 - col

      if (piece.type === 'king') {
        const table = endgame ? KING_ENDGAME_TABLE : KING_MIDDLE_TABLE
        posValue = table[adjRow]![adjCol]!
      } else {
        switch (piece.type) {
          case 'pawn': posValue = PAWN_TABLE[adjRow]![adjCol]!; break
          case 'knight': posValue = KNIGHT_TABLE[adjRow]![adjCol]!; break
          case 'bishop': posValue = BISHOP_TABLE[adjRow]![adjCol]!; break
          case 'rook': posValue = ROOK_TABLE[adjRow]![adjCol]!; break
          case 'queen': posValue = QUEEN_TABLE[adjRow]![adjCol]!; break
        }
      }
      score += sign * posValue
    }
  }

  // Style adjustments
  if (searchStyle === 'aggressive') {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board[row]![col]
        if (!piece || piece.color !== perspective) continue
        if (piece.type === 'knight' || piece.type === 'bishop') {
          const centerDist = Math.abs(3.5 - row) + Math.abs(3.5 - col)
          if (centerDist <= 2) score += 15
        }
        if (piece.type === 'pawn') {
          score += (piece.color === 'white' ? (6 - row) : (row - 1)) * 3
        }
      }
    }
  } else if (searchStyle === 'defensive') {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board[row]![col]
        if (!piece || piece.color !== perspective || piece.type !== 'pawn') continue
        const leftSame = board[row]![col - 1]
        const rightSame = board[row]![col + 1]
        if (
          (leftSame && leftSame.type === 'pawn' && leftSame.color === piece.color) ||
          (rightSame && rightSame.type === 'pawn' && rightSame.color === piece.color)
        ) score += 10
      }
    }
  }

  return score
}

// ============================================================
// Search State (module-level)
// ============================================================
let board: Board = []
let searchStyle: AIStyle = 'balanced'
let searchHash: number = 0
let searchStartTime: number = 0
let searchTimeLimit: number = 0
let searchStopped: boolean = false
let searchNodes: number = 0

function checkTimeLimit(): boolean {
  if (searchStopped) return true
  if (performance.now() - searchStartTime >= searchTimeLimit) {
    searchStopped = true
    return true
  }
  return false
}

function computeHash(b: Board, currentTurn: Color, epFile: number | null): number {
  let h = 0
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = b[r]![c]
      if (p) {
        h ^= zobristPiece[PIECE_TYPE_INDEX[p.type]!]![COLOR_INDEX[p.color]!]![r * 8 + c]!
      }
    }
  }
  if (currentTurn === 'black') h ^= zobristBlackToMove
  if (epFile !== null && epFile >= 0 && epFile < 8) h ^= zobristEnPassant[epFile]!
  return h >>> 0
}

// ============================================================
// Quiescence Search (captures only)
// @param color - the side whose turn it is
// Returns score from `color`'s perspective
// ============================================================
function quiescenceSearch(
  color: Color,
  alpha: number,
  beta: number,
  epTarget: { row: number; col: number } | null,
  lastMove: { from: Square; to: Square } | null,
): number {
  if (checkTimeLimit()) return 0
  searchNodes++

  const standPat = evaluateBoardInternal(color)
  if (standPat >= beta) return beta
  if (standPat > alpha) alpha = standPat

  const captures = generateLegalMoves(color, epTarget, true, lastMove)
  if (captures.length === 0) return alpha

  // Score captures for ordering
  const scored = captures.map((m) => {
    const victim = m.special === 'enPassant'
      ? board[m.fromRow]![m.toCol]
      : board[m.toRow]![m.toCol]
    const victimVal = victim ? PIECE_VALUES[victim.type] ?? 0 : 100
    const attacker = board[m.fromRow]![m.fromCol]
    const attackerVal = PIECE_VALUES[attacker?.type ?? 'pawn'] ?? 0
    return { move: m, score: victimVal * 10 - attackerVal + (m.promotion ? 900 : 0) }
  })
  scored.sort((a, b) => b.score - a.score)

  const opponent = oppositeColor(color)

  for (const { move } of scored) {
    // Delta pruning
    const victim = move.special === 'enPassant'
      ? board[move.fromRow]![move.toCol]
      : board[move.toRow]![move.toCol]
    const victimVal = victim ? PIECE_VALUES[victim.type] ?? 0 : 100
    const promotionBonus = move.promotion ? 800 : 0
    if (standPat + victimVal + promotionBonus + 200 < alpha) continue

    const oldEpFile = epTarget ? epTarget.col : null
    const { changes, newEpTarget, oldHash } = makeMove(move, oldEpFile)
    const score = -quiescenceSearch(opponent, -beta, -alpha, newEpTarget, {
      from: { row: move.fromRow, col: move.fromCol },
      to: { row: move.toRow, col: move.toCol },
    })
    unmakeMove(changes, oldHash)

    if (score >= beta) return beta
    if (score > alpha) alpha = score
  }

  return alpha
}

// ============================================================
// PVS (Principal Variation Search) — Negamax with color parameter
// @param color  — side whose turn it is
// @param ply    — distance from root (for killer indexing)
// Returns score from `color`'s perspective
// ============================================================
function pvs(
  color: Color,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  epTarget: { row: number; col: number } | null,
  lastMove: { from: Square; to: Square } | null,
): number {
  if (checkTimeLimit()) return 0
  searchNodes++

  // --- Transposition table probe ---
  const ttEntry = probeTT(searchHash, depth, alpha, beta)
  if (ttEntry.hit) return ttEntry.score

  // --- Terminal checks ---
  const moves = generateLegalMoves(color, epTarget, false, lastMove)
  if (moves.length === 0) {
    if (isKingInCheck(board, color)) {
      return -MATE_SCORE + (MAX_DEPTH - depth) // checkmate
    }
    return 0 // stalemate
  }

  // --- Quiescence search at horizon ---
  if (depth <= 0) {
    return quiescenceSearch(color, alpha, beta, epTarget, lastMove)
  }

  // --- Mate distance pruning ---
  const matingScore = MATE_SCORE - (MAX_DEPTH - depth)
  if (alpha < -matingScore) alpha = -matingScore
  if (beta > matingScore) beta = matingScore

  // --- Null Move Pruning ---
  const inCheck = isKingInCheck(board, color)
  if (depth >= 3 && !inCheck) {
    const R = 3 + Math.floor(depth / 4)
    const opponent = oppositeColor(color)
    // Null move: pass turn. Save hash, toggle side, clear ep.
    const savedHash = searchHash
    searchHash ^= zobristBlackToMove
    if (epTarget !== null) searchHash ^= zobristEnPassant[epTarget.col]!
    searchHash >>>= 0

    const score = -pvs(opponent, depth - 1 - R, -beta, -beta + 1, ply + 1, null, null)
    searchHash = savedHash

    if (score >= beta) return beta
  }

  // --- Static eval for pruning heuristics ---
  const staticEval = evaluateBoardInternal(color)

  // --- Razoring ---
  if (depth <= 2 && !inCheck && staticEval + 600 <= alpha) {
    const qScore = quiescenceSearch(color, alpha, beta, epTarget, lastMove)
    if (qScore <= alpha) return qScore
  }

  // --- Score and order moves ---
  const ttBestMove = ttEntry.bestMove
  const scoredMoves = moves.map((m) => ({
    move: m,
    score: scoreMoveForOrdering(m, ttBestMove, ply),
  }))
  scoredMoves.sort((a, b) => b.score - a.score)

  // --- Search moves ---
  let bestScore = -INF
  let bestMove: AIDetailedMove | null = null
  let flag = TT_ALPHA
  let movesSearched = 0
  const opponent = oppositeColor(color)

  for (const { move } of scoredMoves) {
    movesSearched++

    const isCapture = board[move.toRow]![move.toCol] !== null || move.special === 'enPassant'
    const isPromotion = !!move.promotion

    // --- Check Extension ---
    let extension = 0

    // --- Late Move Reduction ---
    let reduction = 0
    if (movesSearched >= 4 && depth >= 3 && !isCapture && move.special !== 'enPassant' && !isPromotion && !inCheck) {
      reduction = 1 + Math.floor(movesSearched / 8)
      if (reduction > depth - 1) reduction = depth - 1
    }

    // --- Futility Pruning ---
    if (depth <= 3 && !inCheck && !isCapture && move.special !== 'enPassant' && !isPromotion) {
      const margin = depth * 120
      if (staticEval + margin <= alpha) {
        if (movesSearched > 1) continue // keep at least one move
      }
    }

    const oldEpFile = epTarget ? epTarget.col : null
    const { changes, newEpTarget, oldHash } = makeMove(move, oldEpFile)

    const newLastMove = {
      from: { row: move.fromRow, col: move.fromCol },
      to: { row: move.toRow, col: move.toCol },
    }

    let score: number
    const newDepth = depth - 1 - reduction + extension

    if (movesSearched === 1) {
      // First move: full window
      score = -pvs(opponent, newDepth, -beta, -alpha, ply + 1, newEpTarget, newLastMove)
    } else {
      // Zero-window search (PVS)
      score = -pvs(opponent, newDepth, -alpha - 1, -alpha, ply + 1, newEpTarget, newLastMove)
      // Re-search with full window if score improved
      if (score > alpha && score < beta) {
        score = -pvs(opponent, depth - 1 + extension, -beta, -alpha, ply + 1, newEpTarget, newLastMove)
      }
    }

    unmakeMove(changes, oldHash)

    if (score > bestScore) {
      bestScore = score
      bestMove = move
    }
    if (score > alpha) {
      alpha = score
      flag = TT_EXACT
    }
    if (score >= beta) {
      flag = TT_BETA
      bestMove = move
      recordKillerMove(move, ply)
      recordHistory(move, depth * depth)
      break
    }
  }

  storeTT(searchHash, depth, bestScore, flag, bestMove)
  return bestScore
}

// ============================================================
// Iterative Deepening with Aspiration Windows
// ============================================================
function iterativeDeepening(
  aiColor: Color,
  initialEpTarget: { row: number; col: number } | null,
  lastMove: { from: Square; to: Square } | null,
  maxDepth: number,
): { bestMove: AIDetailedMove; score: number } | null {
  const moves = generateLegalMoves(aiColor, initialEpTarget, false, lastMove)
  if (moves.length === 0) return null

  let bestMove: AIDetailedMove = moves[0]!
  let bestScore = -INF

  // Score root moves
  const rootMoves = moves.map((m) => ({ move: m, score: scoreMoveForOrdering(m, null, 0) }))
  rootMoves.sort((a, b) => b.score - a.score)

  let prevScore = -INF
  const opponent = oppositeColor(aiColor)

  for (let depth = 1; depth <= maxDepth; depth++) {
    let localBestMove: AIDetailedMove = rootMoves[0]!.move
    let localBestScore = -INF

    // --- Aspiration Window ---
    let alpha = -INF
    let beta = INF
    if (depth >= 3 && prevScore > -MATE_SCORE / 2) {
      const window = 50
      alpha = prevScore - window
      beta = prevScore + window
    }

    let firstMove = true

    // Aspiration window widening loop
    while (true) {
      if (checkTimeLimit()) return { bestMove, score: bestScore }

      for (const { move } of rootMoves) {
        if (checkTimeLimit()) return { bestMove, score: bestScore }

        const oldEpFile = initialEpTarget ? initialEpTarget.col : null
        const { changes, newEpTarget, oldHash } = makeMove(move, oldEpFile)

        const newLastMove = {
          from: { row: move.fromRow, col: move.fromCol },
          to: { row: move.toRow, col: move.toCol },
        }

        let score: number
        if (firstMove) {
          score = -pvs(opponent, depth - 1, -beta, -alpha, 1, newEpTarget, newLastMove)
          firstMove = false
        } else {
          score = -pvs(opponent, depth - 1, -alpha - 1, -alpha, 1, newEpTarget, newLastMove)
          if (score > alpha && score < beta) {
            score = -pvs(opponent, depth - 1, -beta, -alpha, 1, newEpTarget, newLastMove)
          }
        }

        unmakeMove(changes, oldHash)

        if (score > localBestScore) {
          localBestScore = score
          localBestMove = move
        }
        if (score > alpha) alpha = score
      }

      // If we got a score within the aspiration window, we're done with this depth
      if (localBestScore > alpha - 1 || alpha >= INF - 1) break

      // Widening: score fell below window — re-search with wider window
      alpha = -INF
      beta = localBestScore + 1 // try again with wider lower bound
      firstMove = true
      // safety: limit retries
      if (alpha < -INF + 100) break
    }

    // Depth completed
    if (!searchStopped) {
      bestMove = localBestMove
      bestScore = localBestScore
      prevScore = bestScore

      // Re-sort root moves for next iteration (TT-guided)
      rootMoves.sort((a, b) =>
        scoreMoveForOrdering(b.move, bestMove, depth + 1) -
        scoreMoveForOrdering(a.move, bestMove, depth + 1),
      )

      // Early exit on forced mate
      if (bestScore > MATE_SCORE - 100 || bestScore < -MATE_SCORE + 100) {
        return { bestMove, score: bestScore }
      }
    } else {
      return { bestMove, score: bestScore }
    }
  }

  return { bestMove, score: bestScore }
}

// ============================================================
// Utilities
// ============================================================
function findKingRow(b: Board, color: Color): number {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = b[row]![col]
      if (piece && piece.type === 'king' && piece.color === color) return row
    }
  }
  return 0
}

function findKingCol(b: Board, color: Color): number {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = b[row]![col]
      if (piece && piece.type === 'king' && piece.color === color) return col
    }
  }
  return 0
}

// ============================================================
// Public API
// ============================================================
export function getBestAIMove(
  b: Board,
  color: Color,
  difficulty: AIDifficulty,
  style: AIStyle,
  lastMove: { from: Square; to: Square } | null,
): AIDetailedMove | null {
  // Reset search state
  searchStyle = style
  searchStartTime = performance.now()
  searchStopped = false
  searchNodes = 0
  ttHits = 0

  for (let d = 0; d < MAX_DEPTH; d++) {
    killerMoves[d]![0] = null
    killerMoves[d]![1] = null
  }

  const timeLimitMap: Record<AIDifficulty, number> = {
    1: 100, 2: 500, 3: 1500, 4: 4000, 5: 8000,
  }
  searchTimeLimit = timeLimitMap[difficulty]

  const depthMap: Record<AIDifficulty, number> = {
    1: 2, 2: 5, 3: 8, 4: 15, 5: 25,
  }
  const maxDepth = depthMap[difficulty]

  board = b
  const epTarget = getEnPassantTarget(lastMove)
  const epFile = epTarget ? epTarget.col : null
  searchHash = computeHash(board, color, epFile)

  const moves = generateLegalMoves(color, epTarget, false, lastMove)
  if (moves.length === 0) return null
  if (moves.length === 1) return moves[0]!

  const result = iterativeDeepening(color, epTarget, lastMove, maxDepth)
  if (!result) return moves[0]!

  // Randomization for low difficulty / unpredictable style
  if (style === 'unpredictable' || difficulty <= 2) {
    const topMoves: AIDetailedMove[] = [result.bestMove]
    for (const move of moves) {
      if (move === result.bestMove) continue
      const oldEpFile = epTarget ? epTarget.col : null
      const { changes, oldHash } = makeMove(move, oldEpFile)
      const score = evaluateBoardInternal(color)
      unmakeMove(changes, oldHash)
      if (Math.random() < 0.3 / moves.length) topMoves.push(move)
    }
    if (topMoves.length > 1 && difficulty <= 1) {
      if (Math.random() < 0.3) return moves[Math.floor(Math.random() * moves.length)]!
    }
    return topMoves[Math.floor(Math.random() * topMoves.length)]!
  }

  return result.bestMove
}

export function getPromotionChoice(
  b: Board, toRow: number, toCol: number, color: Color,
): 'queen' | 'knight' | 'rook' | 'bishop' {
  const opponent = oppositeColor(color)
  const enemyKingRow = findKingRow(b, opponent)
  const enemyKingCol = findKingCol(b, opponent)
  const knightOffsets: [number, number][] = [
    [2, 1], [2, -1], [-2, 1], [-2, -1],
    [1, 2], [1, -2], [-1, 2], [-1, -2],
  ]
  for (const [dRow, dCol] of knightOffsets) {
    if (toRow + dRow === enemyKingRow && toCol + dCol === enemyKingCol) return 'knight'
  }
  return 'queen'
}

export function getTotalLegalMoveCount(
  b: Board, color: Color, lastMove: { from: Square; to: Square } | null,
): number {
  const savedBoard = board
  board = b
  const epTarget = getEnPassantTarget(lastMove)
  const count = generateLegalMoves(color, epTarget, false, lastMove).length
  board = savedBoard
  return count
}

export function getMaterialAdvantage(b: Board, color: Color): number {
  let score = 0
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = b[row]![col]
      if (!piece) continue
      score += piece.color === color ? (PIECE_VALUES[piece.type] ?? 0) : -(PIECE_VALUES[piece.type] ?? 0)
    }
  }
  return score
}