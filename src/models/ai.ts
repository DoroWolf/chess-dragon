import type {
  Board,
  Color,
  Square,
  Move,
  Piece,
  PieceType,
  MoveOptions,
} from './chess'
import {
  getPieceMoves,
  isKingInCheck,
  getEnPassantTarget,
  isWhiteSquare,
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
  pawn: 100,
  knight: 320,
  bishop: 330,
  rook: 500,
  queen: 900,
  king: 20000,
}

const PIECE_TYPE_INDEX: Record<string, number> = {
  pawn: 0,
  knight: 1,
  bishop: 2,
  rook: 3,
  queen: 4,
  king: 5,
}

const COLOR_INDEX: Record<string, number> = {
  white: 0,
  black: 1,
}

const TT_EXACT = 0
const TT_ALPHA = 1 // upper bound (score <= alpha, fail-low)
const TT_BETA = 2 // lower bound (score >= beta, fail-high)

const MAX_DEPTH = 64
const TT_SIZE = 1 << 17 // 131072 entries
const TT_MASK = TT_SIZE - 1

const INF = 999999
const MATE_SCORE = 99999

// ============================================================
// Piece-Square Tables (same as original)
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
// Seeded PRNG for Zobrist keys
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

// ============================================================
// Zobrist Hashing Tables
// ============================================================
// zobristPiece[pieceTypeIdx][colorIdx][row * 8 + col]
const zobristPiece: number[][][] = Array.from({ length: 6 }, () =>
  Array.from({ length: 2 }, () => new Array(64).fill(0)),
)
// zobristEnPassant[file] - only for the file where en passant is possible
const zobristEnPassant: number[] = new Array(8).fill(0)
// zobristBlackToMove
let zobristBlackToMove = 0

// Initialize all Zobrist keys
;(function initZobrist() {
  for (let pt = 0; pt < 6; pt++) {
    for (let c = 0; c < 2; c++) {
      for (let sq = 0; sq < 64; sq++) {
        zobristPiece[pt]![c]![sq] = rng()
      }
    }
  }
  for (let f = 0; f < 8; f++) {
    zobristEnPassant[f] = rng()
  }
  zobristBlackToMove = rng()
})()

// ============================================================
// Transposition Table
// ============================================================
interface TTEntry {
  hash: number // full hash for verification
  depth: number
  score: number
  flag: number // TT_EXACT | TT_ALPHA | TT_BETA
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
    if (entry.flag === TT_EXACT) {
      return { hit: true, score: entry.score, bestMove: entry.bestMove }
    }
    if (entry.flag === TT_ALPHA && entry.score <= alpha) {
      return { hit: true, score: alpha, bestMove: entry.bestMove }
    }
    if (entry.flag === TT_BETA && entry.score >= beta) {
      return { hit: true, score: beta, bestMove: entry.bestMove }
    }
  }
  return { hit: false, score: 0, bestMove: entry?.bestMove ?? null }
}

function storeTT(
  hash: number,
  depth: number,
  score: number,
  flag: number,
  bestMove: AIDetailedMove | null,
): void {
  const idx = hash & TT_MASK
  const existing = tt[idx]
  // Always replace strategy (standard for chess)
  // Except: don't replace an exact entry at the same depth with a lower-depth entry
  if (existing && existing.hash === hash && existing.depth > depth && existing.flag === TT_EXACT) {
    return
  }
  tt[idx] = { hash, depth, score, flag, bestMove }
}

// ============================================================
// Killer Moves & History Table
// ============================================================
// killerMoves[depth][slot 0..1]
const killerMoves: (AIDetailedMove | null)[][] = Array.from({ length: MAX_DEPTH }, () => [
  null,
  null,
])

// historyTable[colorIdx][fromRow][fromCol][toRow][toCol]
const historyTable: number[][][][][] = Array.from({ length: 2 }, () =>
  Array.from({ length: 8 }, () =>
    Array.from({ length: 8 }, () =>
      Array.from({ length: 8 }, () => new Array(8).fill(0)),
    ),
  ),
)

function recordKillerMove(move: AIDetailedMove, depth: number): void {
  if (move.special) return // don't store special moves (castling, en passant)
  const from = board[move.fromRow]?.[move.fromCol]
  const to = board[move.toRow]?.[move.toCol]
  if (to) return // don't store captures (they're already ordered by MVV-LVA)

  const slot = killerMoves[depth]!
  const killer0 = slot[0]
  if (killer0 && killer0.fromRow === move.fromRow && killer0.fromCol === move.fromCol &&
    killer0.toRow === move.toRow && killer0.toCol === move.toCol) {
    return // already stored
  }
  slot[1] = killer0 ?? null
  slot[0] = move
}

function recordHistory(move: AIDetailedMove, color: Color, depthBonus: number): void {
  if (move.special) return
  const piece = board[move.fromRow]?.[move.fromCol]
  if (!piece) return
  const ci = COLOR_INDEX[piece.color]!
  const histRow = historyTable[ci]![move.fromRow]![move.fromCol]![move.toRow]!
  histRow[move.toCol]! += depthBonus
}

// ============================================================
// Board Change Tracking (Make/Unmake)
// ============================================================
interface BoardChange {
  row: number
  col: number
  oldPiece: Piece | null
}

function makeChange(
  board: Board,
  row: number,
  col: number,
  newPiece: Piece | null,
  changes: BoardChange[],
): void {
  changes.push({ row, col, oldPiece: board[row]![col]! })
  board[row]![col] = newPiece
}

/**
 * Make a move on the board, returning changes to undo.
 * Also returns the new en passant target and whether a pawn was promoted.
 */
function makeMove(
  board: Board,
  move: AIDetailedMove,
): {
  changes: BoardChange[]
  newEnPassantTarget: { row: number; col: number } | null
  wasPromotion: boolean
} {
  const changes: BoardChange[] = []
  const piece = board[move.fromRow]![move.fromCol]!

  let newEnPassantTarget: { row: number; col: number } | null = null
  let wasPromotion = false

  if (move.special === 'castle' && move.rookFrom && move.rookTo) {
    // Move king
    makeChange(board, move.toRow, move.toCol, { ...piece, hasMoved: true }, changes)
    makeChange(board, move.fromRow, move.fromCol, null, changes)
    // Move rook
    const rook = board[move.rookFrom.row]![move.rookFrom.col]!
    makeChange(board, move.rookTo.row, move.rookTo.col, { ...rook, hasMoved: true }, changes)
    makeChange(board, move.rookFrom.row, move.rookFrom.col, null, changes)
  } else if (move.special === 'enPassant') {
    // Move pawn
    const promotedType = (move.toRow === 0 || move.toRow === 7)
      ? move.promotion ?? 'queen'
      : piece.type
    makeChange(
      board,
      move.toRow,
      move.toCol,
      { type: promotedType, color: piece.color, hasMoved: true },
      changes,
    )
    makeChange(board, move.fromRow, move.fromCol, null, changes)
    // Remove captured pawn
    makeChange(board, move.fromRow, move.toCol, null, changes)
    wasPromotion = promotedType !== 'pawn'
  } else {
    // Normal move (including promotion)
    const isPawn = piece.type === 'pawn'
    const isDoublePush = isPawn && Math.abs(move.toRow - move.fromRow) === 2
    const promotedType = isPawn && (move.toRow === 0 || move.toRow === 7)
      ? move.promotion ?? 'queen'
      : piece.type

    makeChange(
      board,
      move.toRow,
      move.toCol,
      { type: promotedType, color: piece.color, hasMoved: true },
      changes,
    )
    makeChange(board, move.fromRow, move.fromCol, null, changes)

    if (isDoublePush) {
      newEnPassantTarget = {
        row: (move.fromRow + move.toRow) >> 1,
        col: move.fromCol,
      }
    }
    wasPromotion = promotedType !== piece.type
  }

  return { changes, newEnPassantTarget, wasPromotion }
}

/**
 * Undo a move by restoring all changed squares.
 */
function unmakeMove(board: Board, changes: BoardChange[]): void {
  for (let i = changes.length - 1; i >= 0; i--) {
    const ch = changes[i]!
    board[ch.row]![ch.col] = ch.oldPiece
  }
}

// ============================================================
// Move Generation (legal moves for a color)
// ============================================================
function generateLegalMoves(
  board: Board,
  color: Color,
  enPassantTarget: { row: number; col: number } | null,
  capturesOnly: boolean,
  lastMove: { from: Square; to: Square } | null,
): AIDetailedMove[] {
  const moves: AIDetailedMove[] = []

  // Compute en passant target from lastMove if not provided
  const epTarget = enPassantTarget ?? getEnPassantTarget(lastMove)
  const moveOpts: MoveOptions = { enPassantTarget: epTarget, lastMove }

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row]![col]
      if (!piece || piece.color !== color) continue

      const candidateMoves = getPieceMoves(board, row, col, moveOpts)

      for (const m of candidateMoves) {
        const isCapture = board[m.row]![m.col] !== null || m.special === 'enPassant'

        if (capturesOnly && !isCapture) continue

        const detailedMove: AIDetailedMove = {
          fromRow: row,
          fromCol: col,
          toRow: m.row,
          toCol: m.col,
          special: m.special,
          rookFrom: m.rookFrom,
          rookTo: m.rookTo,
        }

        // For promotion moves, add queen promotion
        if (piece.type === 'pawn' && (m.row === 0 || m.row === 7)) {
          detailedMove.promotion = 'queen'
        }

        // Test legality using make/unmake
        const { changes } = makeMove(board, detailedMove)
        const legal = !isKingInCheck(board, color)
        unmakeMove(board, changes)

        if (legal) {
          moves.push(detailedMove)
        }
      }
    }
  }

  return moves
}

// ============================================================
// Move Scoring / Ordering
// ============================================================
const MOVE_SCORE_TT = 10000000
const MOVE_SCORE_CAPTURE_BASE = 1000000
const MOVE_SCORE_KILLER_BASE = 900000
const MOVE_SCORE_KILLER2 = 800000

function scoreMoveForOrdering(
  move: AIDetailedMove,
  ttMove: AIDetailedMove | null,
  board: Board,
  depth: number,
): number {
  // 1. TT best move first
  if (
    ttMove &&
    ttMove.fromRow === move.fromRow &&
    ttMove.fromCol === move.fromCol &&
    ttMove.toRow === move.toRow &&
    ttMove.toCol === move.toCol &&
    ttMove.special === move.special
  ) {
    return MOVE_SCORE_TT
  }

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
  if (move.promotion) {
    return MOVE_SCORE_CAPTURE_BASE + 900 // promote to queen
  }

  // 4. Killer moves
  const killer0 = killerMoves[depth]![0]
  if (
    killer0 &&
    killer0.fromRow === move.fromRow &&
    killer0.fromCol === move.fromCol &&
    killer0.toRow === move.toRow &&
    killer0.toCol === move.toCol
  ) {
    return MOVE_SCORE_KILLER_BASE
  }
  const killer1 = killerMoves[depth]![1]
  if (
    killer1 &&
    killer1.fromRow === move.fromRow &&
    killer1.fromCol === move.fromCol &&
    killer1.toRow === move.toRow &&
    killer1.toCol === move.toCol
  ) {
    return MOVE_SCORE_KILLER2
  }

  // 5. History heuristic
  const piece = board[move.fromRow]![move.fromCol]
  if (piece && !move.special) {
    const ci = COLOR_INDEX[piece.color]!
    return historyTable[ci]![move.fromRow]![move.fromCol]![move.toRow]![move.toCol] ?? 0
  }

  return 0
}

// ============================================================
// Search state (module-level, reset per search)
// ============================================================
let board: Board = []
let searchColor: Color = 'white'
let searchStyle: AIStyle = 'balanced'
let searchHash: number = 0
let searchStartTime: number = 0
let searchTimeLimit: number = 0
let searchStopped: boolean = false
let searchNodes: number = 0
let pvLine: AIDetailedMove[] = []

function checkTimeLimit(): boolean {
  if (searchStopped) return true
  if (performance.now() - searchStartTime >= searchTimeLimit) {
    searchStopped = true
    return true
  }
  return false
}

// ============================================================
// Compute Zobrist hash from board state
// ============================================================
function computeHash(
  b: Board,
  currentTurn: Color,
  enPassantFile: number | null,
): number {
  let h = 0
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = b[r]![c]
      if (p) {
        const ptIdx = PIECE_TYPE_INDEX[p.type]!
        const cIdx = COLOR_INDEX[p.color]!
        h ^= zobristPiece[ptIdx]![cIdx]![r * 8 + c]!
      }
    }
  }
  if (currentTurn === 'black') {
    h ^= zobristBlackToMove
  }
  if (enPassantFile !== null && enPassantFile >= 0 && enPassantFile < 8) {
    h ^= zobristEnPassant[enPassantFile]!
  }
  return h >>> 0
}

// ============================================================
// Incremental hash update for make/unmake
// ============================================================
function updateHashMove(
  hash: number,
  piece: Piece,
  fromSq: number,
  toSq: number,
  captured: Piece | null,
  capturedSq: number,
  oldEpFile: number | null,
  newEpFile: number | null,
  sideToMove: Color,
): number {
  let h = hash
  const ptIdx = PIECE_TYPE_INDEX[piece.type]!
  const cIdx = COLOR_INDEX[piece.color]!

  // Remove piece from source square
  h ^= zobristPiece[ptIdx]![cIdx]![fromSq]!
  // Add piece to destination square
  h ^= zobristPiece[ptIdx]![cIdx]![toSq]!

  // Remove captured piece
  if (captured) {
    const capPtIdx = PIECE_TYPE_INDEX[captured.type]!
    const capCIdx = COLOR_INDEX[captured.color]!
    h ^= zobristPiece[capPtIdx]![capCIdx]![capturedSq]!
  }

  // Update en passant file
  if (oldEpFile !== null) h ^= zobristEnPassant[oldEpFile]!
  if (newEpFile !== null) h ^= zobristEnPassant[newEpFile]!

  // Toggle side to move
  h ^= zobristBlackToMove

  return h >>> 0
}

// ============================================================
// Fast endgame detection
// ============================================================
function isEndgame(board: Board): boolean {
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

// ============================================================
// Board Evaluation
// ============================================================
function evaluateBoardInternal(b: Board, perspective: Color): number {
  let score = 0
  const endgame = isEndgame(b)

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = b[row]![col]
      if (!piece) continue

      const sign = piece.color === perspective ? 1 : -1
      const baseValue = PIECE_VALUES[piece.type] ?? 0
      score += sign * baseValue

      let posValue = 0
      if (piece.type === 'king') {
        const table = endgame ? KING_ENDGAME_TABLE : KING_MIDDLE_TABLE
        const adjRow = piece.color === 'white' ? row : 7 - row
        const adjCol = piece.color === 'white' ? col : 7 - col
        posValue = table[adjRow]![adjCol]!
      } else {
        const adjRow = piece.color === 'white' ? row : 7 - row
        const adjCol = piece.color === 'white' ? col : 7 - col
        switch (piece.type) {
          case 'pawn':
            posValue = PAWN_TABLE[adjRow]![adjCol]!
            break
          case 'knight':
            posValue = KNIGHT_TABLE[adjRow]![adjCol]!
            break
          case 'bishop':
            posValue = BISHOP_TABLE[adjRow]![adjCol]!
            break
          case 'rook':
            posValue = ROOK_TABLE[adjRow]![adjCol]!
            break
          case 'queen':
            posValue = QUEEN_TABLE[adjRow]![adjCol]!
            break
        }
      }
      score += sign * posValue
    }
  }

  // Style adjustments
  if (searchStyle === 'aggressive') {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = b[row]![col]
        if (!piece || piece.color !== perspective) continue
        if (piece.type === 'knight' || piece.type === 'bishop') {
          const centerDist = Math.abs(3.5 - row) + Math.abs(3.5 - col)
          if (centerDist <= 2) {
            score += 15
          }
        }
        if (piece.type === 'pawn') {
          const advance = piece.color === 'white' ? (6 - row) : (row - 1)
          score += advance * 3
        }
      }
    }
  } else if (searchStyle === 'defensive') {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = b[row]![col]
        if (!piece || piece.color !== perspective) continue
        // Bonus for pieces near own king
        if (piece.type === 'pawn') {
          const leftSame = b[row]![col - 1]
          const rightSame = b[row]![col + 1]
          if (
            (leftSame && leftSame.type === 'pawn' && leftSame.color === piece.color) ||
            (rightSame && rightSame.type === 'pawn' && rightSame.color === piece.color)
          ) {
            score += 10
          }
        }
      }
    }
  }

  return score
}

// ============================================================
// Quiescence Search (captures only)
// ============================================================
function quiescenceSearch(
  alpha: number,
  beta: number,
  enPassantTarget: { row: number; col: number } | null,
  lastMove: { from: Square; to: Square } | null,
): number {
  if (checkTimeLimit()) return 0
  
  searchNodes++

  // Stand pat
  const standPat = evaluateBoardInternal(board, searchColor)
  if (standPat >= beta) return beta
  if (standPat > alpha) alpha = standPat

  // Generate captures
  const captures = generateLegalMoves(board, searchColor, enPassantTarget, true, lastMove)
  if (captures.length === 0) return alpha

  // Score captures for ordering
  const scored: { move: AIDetailedMove; score: number }[] = captures.map((m) => {
    const victim = board[m.toRow]![m.toCol]
    const attacker = board[m.fromRow]![m.fromCol]
    const victimVal = victim ? PIECE_VALUES[victim.type] ?? 0 : 100 // en passant = pawn
    const attackerVal = PIECE_VALUES[attacker?.type ?? 'pawn'] ?? 0
    return {
      move: m,
      score: victimVal * 10 - attackerVal + (m.promotion ? 900 : 0),
    }
  })
  scored.sort((a, b) => b.score - a.score)

  for (const { move } of scored) {
    // Delta pruning: skip captures that can't possibly improve alpha
    const victim = move.special === 'enPassant'
      ? board[move.fromRow]![move.toCol]
      : board[move.toRow]![move.toCol]
    const victimVal = victim ? PIECE_VALUES[victim.type] ?? 0 : 100
    const promotionBonus = move.promotion ? 800 : 0
    if (standPat + victimVal + promotionBonus + 200 < alpha) continue

    const { changes, newEnPassantTarget } = makeMove(board, move)
    const score = -quiescenceSearch(-beta, -alpha, newEnPassantTarget, {
      from: { row: move.fromRow, col: move.fromCol },
      to: { row: move.toRow, col: move.toCol },
    })
    unmakeMove(board, changes)

    if (score >= beta) return beta
    if (score > alpha) alpha = score
  }

  return alpha
}

// ============================================================
// PVS (Principal Variation Search)
// ============================================================
function pvs(
  depth: number,
  alpha: number,
  beta: number,
  enPassantTarget: { row: number; col: number } | null,
  lastMove: { from: Square; to: Square } | null,
): number {
  if (checkTimeLimit()) return 0

  searchNodes++

  // Transposition table probe
  const ttEntry = probeTT(searchHash, depth, alpha, beta)
  if (ttEntry.hit) {
    return ttEntry.score
  }

  // --- Terminal checks ---
  const moves = generateLegalMoves(board, searchColor, enPassantTarget, false, lastMove)

  if (moves.length === 0) {
    if (isKingInCheck(board, searchColor)) {
      // Checkmate - prefer quicker mates
      return -MATE_SCORE + (MAX_DEPTH - depth)
    }
    // Stalemate
    return 0
  }

  // Enter quiescence search at depth 0
  if (depth <= 0) {
    return quiescenceSearch(alpha, beta, enPassantTarget, lastMove)
  }

  // --- Null Move Pruning ---
  const canNullMove = depth >= 3 && !isKingInCheck(board, searchColor)
  if (canNullMove) {
    const R = 3 + Math.floor(depth / 4)
    // Swap side to move (skip turn)
    const nullEpTarget: { row: number; col: number } | null = null
    const score = -pvs(depth - 1 - R, -beta, -beta + 1, nullEpTarget, null)
    if (score >= beta) {
      return beta
    }
  }

  // --- Score and order moves ---
  const ttBestMove = ttEntry.bestMove
  const scoredMoves: { move: AIDetailedMove; score: number }[] = moves.map((m) => ({
    move: m,
    score: scoreMoveForOrdering(m, ttBestMove, board, depth),
  }))
  scoredMoves.sort((a, b) => b.score - a.score)

  // --- Search moves ---
  let bestScore = -INF
  let bestMove: AIDetailedMove | null = null
  let flag = TT_ALPHA
  let movesSearched = 0

  for (const { move } of scoredMoves) {
    movesSearched++

    // Late Move Reduction
    let reduction = 0
    if (
      movesSearched >= 4 &&
      depth >= 3 &&
      !board[move.toRow]![move.toCol] && // not a capture
      move.special !== 'enPassant' &&
      !move.promotion
    ) {
      reduction = 1 + Math.floor(movesSearched / 8)
      if (reduction > depth - 1) reduction = depth - 1
    }

    const { changes, newEnPassantTarget } = makeMove(board, move)
    const newLastMove: { from: Square; to: Square } = {
      from: { row: move.fromRow, col: move.fromCol },
      to: { row: move.toRow, col: move.toCol },
    }

    let score: number

    // First move: full window
    if (movesSearched === 1) {
      score = -pvs(depth - 1 - reduction, -beta, -alpha, newEnPassantTarget, newLastMove)
    } else {
      // Zero-window search
      score = -pvs(depth - 1 - reduction, -alpha - 1, -alpha, newEnPassantTarget, newLastMove)
      // If the zero-window search indicates this might be better, re-search with full window
      if (score > alpha && score < beta && reduction > 0) {
        score = -pvs(depth - 1, -beta, -alpha, newEnPassantTarget, newLastMove)
      } else if (score > alpha && score < beta) {
        score = -pvs(depth - 1, -beta, -alpha, newEnPassantTarget, newLastMove)
      }
    }

    unmakeMove(board, changes)

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
      // Record killer & history for beta cutoffs
      recordKillerMove(move, depth)
      recordHistory(move, searchColor, depth * depth)
      break
    }
  }

  // Store in TT
  storeTT(searchHash, depth, bestScore, flag, bestMove)

  return bestScore
}

// ============================================================
// Iterative Deepening
// ============================================================
function iterativeDeepening(
  initialEpTarget: { row: number; col: number } | null,
  lastMove: { from: Square; to: Square } | null,
  maxDepth: number,
): { bestMove: AIDetailedMove; score: number } | null {
  const moves = generateLegalMoves(board, searchColor, initialEpTarget, false, lastMove)
  if (moves.length === 0) return null

  let bestMove: AIDetailedMove = moves[0]!
  let bestScore = -INF

  // Score root moves for initial ordering
  const rootMoves = moves.map((m) => ({
    move: m,
    score: scoreMoveForOrdering(m, null, board, 0),
  }))
  rootMoves.sort((a, b) => b.score - a.score)

  for (let depth = 1; depth <= maxDepth; depth++) {
    let localBestMove: AIDetailedMove = rootMoves[0]!.move
    let localBestScore = -INF
    let alpha = -INF
    const beta = INF

    let firstMove = true

    for (const { move } of rootMoves) {
      if (checkTimeLimit()) {
        // Time's up - return best from previous iteration
        return { bestMove, score: bestScore }
      }

      const { changes, newEnPassantTarget } = makeMove(board, move)
      const newLastMove: { from: Square; to: Square } = {
        from: { row: move.fromRow, col: move.fromCol },
        to: { row: move.toRow, col: move.toCol },
      }

      let score: number
      if (firstMove) {
        score = -pvs(depth - 1, -beta, -alpha, newEnPassantTarget, newLastMove)
        firstMove = false
      } else {
        // Aspiration: search with narrow window first
        score = -pvs(depth - 1, -alpha - 1, -alpha, newEnPassantTarget, newLastMove)
        if (score > alpha && score < beta) {
          score = -pvs(depth - 1, -beta, -alpha, newEnPassantTarget, newLastMove)
        }
      }

      unmakeMove(board, changes)

      if (score > localBestScore) {
        localBestScore = score
        localBestMove = move
      }
      if (score > alpha) {
        alpha = score
      }
    }

    // Full depth completed without timeout
    if (!searchStopped) {
      bestMove = localBestMove
      bestScore = localBestScore

      // Re-sort root moves for next iteration (TT-guided)
      rootMoves.sort((a, b) => {
        return (
          scoreMoveForOrdering(b.move, bestMove, board, depth + 1) -
          scoreMoveForOrdering(a.move, bestMove, board, depth + 1)
        )
      })

      // Early exit if checkmate is found
      if (bestScore > MATE_SCORE - 100 || bestScore < -MATE_SCORE + 100) {
        return { bestMove, score: bestScore }
      }
    } else {
      // Timed out - return best from completed iteration
      return { bestMove, score: bestScore }
    }
  }

  return { bestMove, score: bestScore }
}

// ============================================================
// Find king row/col (utility)
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
// Public API: getBestAIMove
// ============================================================
export function getBestAIMove(
  b: Board,
  color: Color,
  difficulty: AIDifficulty,
  style: AIStyle,
  lastMove: { from: Square; to: Square } | null,
): AIDetailedMove | null {
  // Reset global search state
  searchColor = color
  searchStyle = style
  searchStartTime = performance.now()
  searchStopped = false
  searchNodes = 0
  ttHits = 0

  // Clear killer moves and history for new search
  for (let d = 0; d < MAX_DEPTH; d++) {
    killerMoves[d]![0] = null
    killerMoves[d]![1] = null
  }
  // NOTE: historyTable is kept between searches (useful for move ordering across moves)
  // NOTE: TT is kept between searches (useful for hash hits across moves)
  // They help with move ordering and transpositions across the game.

  // Time allocation per difficulty (ms)
  const timeLimitMap: Record<AIDifficulty, number> = {
    1: 100,  // Basic: quick
    2: 500,  // Easy
    3: 1500, // Medium
    4: 4000, // Hard
    5: 8000, // Expert
  }
  searchTimeLimit = timeLimitMap[difficulty]

  // Depth per difficulty
  const depthMap: Record<AIDifficulty, number> = {
    1: 1,
    2: 3,
    3: 5,
    4: 7,
    5: 12,
  }
  const maxDepth = depthMap[difficulty]

  // Set up board reference and compute initial hash
  board = b

  const epTarget = getEnPassantTarget(lastMove)
  const epFile = epTarget ? epTarget.col : null
  searchHash = computeHash(board, color, epFile)

  // Only one legal move? Return it immediately
  const moves = generateLegalMoves(board, color, epTarget, false, lastMove)
  if (moves.length === 0) return null
  if (moves.length === 1) return moves[0]!

  // Run iterative deepening
  const result = iterativeDeepening(epTarget, lastMove, maxDepth)

  if (!result) return moves[0]!

  // For unpredictable style or low difficulty, add controlled randomness
  if (style === 'unpredictable' || difficulty <= 2) {
    // Collect top moves within a small margin
    const topMoves: AIDetailedMove[] = [result.bestMove]
    const margin = difficulty <= 1 ? 200 : 50

    for (const move of moves) {
      if (move === result.bestMove) continue
      // Quick re-evaluation at depth 1
      const { changes, newEnPassantTarget } = makeMove(board, move)
      const score = -evaluateBoardInternal(board, color)
      unmakeMove(board, changes)
      // Just use a simple random selection from the top few
      const r = Math.random()
      if (r < 0.3 / moves.length) {
        topMoves.push(move)
      }
    }

    if (topMoves.length > 1 && difficulty <= 1) {
      // Low difficulty: pick randomly from all legal moves sometimes
      if (Math.random() < 0.3) {
        return moves[Math.floor(Math.random() * moves.length)]!
      }
    }

    const randomIndex = Math.floor(Math.random() * topMoves.length)
    return topMoves[randomIndex]!
  }

  return result.bestMove
}

// ============================================================
// Public API: getPromotionChoice
// ============================================================
export function getPromotionChoice(
  b: Board,
  toRow: number,
  toCol: number,
  color: Color,
): 'queen' | 'knight' | 'rook' | 'bishop' {
  const enemyColor: Color = color === 'white' ? 'black' : 'white'
  const enemyKingRow = findKingRow(b, enemyColor)
  const enemyKingCol = findKingCol(b, enemyColor)

  // Check if promoting to knight gives a check
  const knightOffsets: [number, number][] = [
    [2, 1], [2, -1], [-2, 1], [-2, -1],
    [1, 2], [1, -2], [-1, 2], [-1, -2],
  ]
  for (const [dRow, dCol] of knightOffsets) {
    if (toRow + dRow === enemyKingRow && toCol + dCol === enemyKingCol) {
      return 'knight'
    }
  }
  return 'queen'
}

// ============================================================
// Public API: getTotalLegalMoveCount
// ============================================================
export function getTotalLegalMoveCount(
  b: Board,
  color: Color,
  lastMove: { from: Square; to: Square } | null,
): number {
  const epTarget = getEnPassantTarget(lastMove)
  return generateLegalMoves(b, color, epTarget, false, lastMove).length
}

// ============================================================
// Public API: getMaterialAdvantage
// ============================================================
export function getMaterialAdvantage(b: Board, color: Color): number {
  let score = 0
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = b[row]![col]
      if (!piece) continue
      const value = PIECE_VALUES[piece.type] ?? 0
      score += piece.color === color ? value : -value
    }
  }
  return score
}