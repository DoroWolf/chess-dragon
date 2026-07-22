import type { Board, Color, Square, Move } from './chess'
import {
  cloneBoard,
  getLegalMoves,
  isKingInCheck,
  isCheckmate,
  isStalemate,
  hasInsufficientMaterial,
  isWhiteSquare,
  getEnPassantTarget,
} from './chess'

// ============================================================
// AI 难度等级与水平
// ============================================================
export type AIDifficulty = 1 | 2 | 3 | 4 | 5

// 下棋风格
export type AIStyle = 'balanced' | 'aggressive' | 'defensive' | 'unpredictable'

// ============================================================
// AI 走法（包含起始位置和目标位置的完整信息）
// ============================================================
export interface AIDetailedMove {
  fromRow: number
  fromCol: number
  toRow: number
  toCol: number
  special?: 'castle' | 'enPassant'
  rookFrom?: Square
  rookTo?: Square
}

// ============================================================
// 棋子基础价值
// ============================================================
const PIECE_VALUES: Record<string, number> = {
  pawn: 100,
  knight: 320,
  bishop: 330,
  rook: 500,
  queen: 900,
  king: 20000,
}

// ============================================================
// 位置评估表（Piece-Square Tables）
// 视角：白方在底部（row 7-0），所以表中的 row 0 对应棋盘底部
// ============================================================

// 兵的进阶位置表
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

// 马的位置表
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

// 象的位置表
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

// 车的位置表
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

// 后的位置表
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

// 王中盘位置表
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

// 王残局位置表（当局面简化时鼓励王走向中心）
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
// 获取某个棋子类型的位置表值
// ============================================================
function getPiecePositionValue(pieceType: string, row: number, col: number, color: Color): number {
  // 对于黑方，需要翻转行号
  const adjustedRow = color === 'white' ? row : 7 - row
  const adjustedCol = color === 'white' ? col : 7 - col

  switch (pieceType) {
    case 'pawn':
      return PAWN_TABLE[adjustedRow]![adjustedCol]!
    case 'knight':
      return KNIGHT_TABLE[adjustedRow]![adjustedCol]!
    case 'bishop':
      return BISHOP_TABLE[adjustedRow]![adjustedCol]!
    case 'rook':
      return ROOK_TABLE[adjustedRow]![adjustedCol]!
    case 'queen':
      return QUEEN_TABLE[adjustedRow]![adjustedCol]!
    case 'king':
      // 残局判定：如果局面简化，使用残局王表
      return 0 // 在 evaluateBoard 中根据阶段动态使用
    default:
      return 0
  }
}

// ============================================================
// 获取所有合法走法（带源坐标）
// ============================================================
function getAllLegalMovesWithSources(
  board: Board,
  color: Color,
  lastMove: { from: Square; to: Square } | null,
): AIDetailedMove[] {
  const moves: AIDetailedMove[] = []

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row]?.[col]
      if (!piece || piece.color !== color) continue

      const enPassantTarget = getEnPassantTarget(lastMove)
      const legalMoves = getLegalMoves(board, row, col, {
        lastMove,
        enPassantTarget,
      })

      for (const move of legalMoves) {
        moves.push({
          fromRow: row,
          fromCol: col,
          toRow: move.row,
          toCol: move.col,
          special: move.special,
          rookFrom: move.rookFrom,
          rookTo: move.rookTo,
        })
      }
    }
  }

  return moves
}

// ============================================================
// 在棋盘上模拟执行走法（返回新棋盘，不修改原棋盘）
// ============================================================
function simulateMove(board: Board, move: AIDetailedMove): Board {
  const newBoard = cloneBoard(board)
  const piece = newBoard[move.fromRow]?.[move.fromCol]
  if (!piece) return newBoard

  if (move.special === 'castle' && move.rookFrom && move.rookTo) {
    const rook = newBoard[move.rookFrom.row]?.[move.rookFrom.col]
    newBoard[move.toRow]![move.toCol] = { ...piece, hasMoved: true }
    newBoard[move.fromRow]![move.fromCol] = null
    if (rook) {
      newBoard[move.rookFrom.row]![move.rookFrom.col] = null
      newBoard[move.rookTo.row]![move.rookTo.col] = { ...rook, hasMoved: true }
    }
  } else if (move.special === 'enPassant') {
    newBoard[move.toRow]![move.toCol] = { ...piece, hasMoved: true }
    newBoard[move.fromRow]![move.fromCol] = null
    newBoard[move.fromRow]![move.toCol] = null
  } else {
    newBoard[move.toRow]![move.toCol] = { ...piece, hasMoved: true }
    newBoard[move.fromRow]![move.fromCol] = null
  }

  return newBoard
}

// ============================================================
// 判断是否为残局阶段（用于切换王的位置表）
// ============================================================
function isEndgame(board: Board): boolean {
  let totalMaterial = 0
  let queenCount = 0

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row]?.[col]
      if (!piece || piece.type === 'king') continue
      totalMaterial += PIECE_VALUES[piece.type] ?? 0
      if (piece.type === 'queen') queenCount++
    }
  }

  // 双方各剩 <= 1 个后，或总物质 <= 1400（约等于除了王外只有轻子+兵）
  return queenCount <= 1 || totalMaterial <= 1400
}

// ============================================================
// 棋盘评估函数
// @param board 当前棋盘
// @param perspective 评估视角（通常是 AI 的颜色）
// @param style AI下棋风格
// ============================================================
function evaluateBoard(
  board: Board,
  perspective: Color,
  style: AIStyle,
): number {
  let score = 0
  const endgame = isEndgame(board)

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row]?.[col]
      if (!piece) continue

      const sign = piece.color === perspective ? 1 : -1
      const baseValue = PIECE_VALUES[piece.type] ?? 0

      // 物质分
      score += sign * baseValue

      // 位置分
      let posValue = 0
      if (piece.type === 'king') {
        const table = endgame ? KING_ENDGAME_TABLE : KING_MIDDLE_TABLE
        const adjustedRow = piece.color === 'white' ? row : 7 - row
        const adjustedCol = piece.color === 'white' ? col : 7 - col
        posValue = table[adjustedRow]![adjustedCol]!
      } else {
        posValue = getPiecePositionValue(piece.type, row, col, piece.color)
      }
      score += sign * posValue

      // 根据风格调整评估
      if (style === 'aggressive') {
        // 进攻风格：鼓励将军威胁和攻击
        if (piece.type === 'knight' || piece.type === 'bishop') {
          // 中心化和活跃度额外奖励
          const centerDist = Math.abs(3.5 - row) + Math.abs(3.5 - col)
          if (centerDist <= 2 && piece.color === perspective) {
            score += sign * 15
          }
        }
        // 鼓励向前推进
        if (piece.type === 'pawn' && piece.color === perspective) {
          const advance = piece.color === 'white' ? (6 - row) : (row - 1)
          score += advance * 3
        }

        // 对敌方王的威胁
        if (piece.color === perspective) {
          const enemyKingRow = findKingRow(board, piece.color === 'white' ? 'black' : 'white')
          const distToKing = Math.abs(row - enemyKingRow) + Math.abs(col - findKingCol(board, piece.color === 'white' ? 'black' : 'white'))
          if (distToKing <= 3) {
            score += 20 // 靠近敌方王
          }
        }
      } else if (style === 'defensive') {
        // 防守风格：更重视己方王的安全和兵结构
        if (piece.color === perspective) {
          // 加强保护己方王周围的棋子
          const ownKingRow = findKingRow(board, perspective)
          const ownKingCol = findKingCol(board, perspective)
          const distToOwnKing = Math.abs(row - ownKingRow) + Math.abs(col - ownKingCol)
          if (distToOwnKing <= 2) {
            score += 15
          }
          // 兵链连起来加分
          if (piece.type === 'pawn') {
            const leftSame = board[row]?.[col - 1]
            const rightSame = board[row]?.[col + 1]
            if (
              (leftSame && leftSame.type === 'pawn' && leftSame.color === piece.color) ||
              (rightSame && rightSame.type === 'pawn' && rightSame.color === piece.color)
            ) {
              score += 10
            }
          }
        }
      } else if (style === 'unpredictable') {
        // 不可预测风格：稍微打乱评估
        // 添加小的伪随机波动，使走法不完全最优
        // 这个在搜索时通过随机因子处理更合适
      }
    }
  }

  return score
}

// 辅助：找到王的行
function findKingRow(board: Board, color: Color): number {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row]?.[col]
      if (piece && piece.type === 'king' && piece.color === color) return row
    }
  }
  return 0
}

function findKingCol(board: Board, color: Color): number {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row]?.[col]
      if (piece && piece.type === 'king' && piece.color === color) return col
    }
  }
  return 0
}

// ============================================================
// 走法排序（用于 Alpha-Beta 剪枝优化）
// 优先评估吃子、将军等 "激烈" 的走法
// ============================================================
function orderMoves(board: Board, moves: AIDetailedMove[]): AIDetailedMove[] {
  return [...moves].sort((a, b) => {
    const targetA = board[a.toRow]?.[a.toCol]
    const targetB = board[b.toRow]?.[b.toCol]
    const pieceA = board[a.fromRow]?.[a.fromCol]
    const pieceB = board[b.fromRow]?.[b.fromCol]

    // MVV-LVA: 用低价值子吃高价值子优先
    const victimValueA = targetA ? PIECE_VALUES[targetA.type] ?? 0 : 0
    const attackerValueA = pieceA ? PIECE_VALUES[pieceA.type] ?? 0 : 0
    const victimValueB = targetB ? PIECE_VALUES[targetB.type] ?? 0 : 0
    const attackerValueB = pieceB ? PIECE_VALUES[pieceB.type] ?? 0 : 0

    const scoreA = victimValueA - attackerValueA / 10
    const scoreB = victimValueB - attackerValueB / 10

    // 升变是很好的走法
    const promotionBonusA = pieceA?.type === 'pawn' && (a.toRow === 0 || a.toRow === 7) ? 800 : 0
    const promotionBonusB = pieceB?.type === 'pawn' && (b.toRow === 0 || b.toRow === 7) ? 800 : 0

    return (scoreB + promotionBonusB) - (scoreA + promotionBonusA)
  })
}

// ============================================================
// Minimax + Alpha-Beta 剪枝搜索
// ============================================================
function alphaBeta(
  board: Board,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  color: Color,
  style: AIStyle,
  lastMove: { from: Square; to: Square } | null,
): number {
  // 终止条件
  if (depth === 0) {
    return evaluateBoard(board, color, style)
  }

  const currentColor = maximizing ? color : (color === 'white' ? 'black' : 'white')
  const moves = getAllLegalMovesWithSources(board, currentColor, lastMove)

  // 无合法走法
  if (moves.length === 0) {
    if (isKingInCheck(board, currentColor)) {
      // 被将死
      return maximizing ? -99999 + (3 - depth) : 99999 - (3 - depth)
    }
    // 无子可动（逼和）
    return 0
  }

  const orderedMoves = orderMoves(board, moves)

  if (maximizing) {
    let maxEval = -Infinity

    for (const move of orderedMoves) {
      const newBoard = simulateMove(board, move)
      const newLastMove: { from: Square; to: Square } = {
        from: { row: move.fromRow, col: move.fromCol },
        to: { row: move.toRow, col: move.toCol },
      }

      const evalScore = alphaBeta(
        newBoard,
        depth - 1,
        alpha,
        beta,
        false,
        color,
        style,
        newLastMove,
      )

      if (evalScore > maxEval) {
        maxEval = evalScore
      }
      if (evalScore > alpha) {
        alpha = evalScore
      }
      if (beta <= alpha) {
        break // Beta 剪枝
      }
    }

    return maxEval
  } else {
    let minEval = Infinity

    for (const move of orderedMoves) {
      const newBoard = simulateMove(board, move)
      const newLastMove: { from: Square; to: Square } = {
        from: { row: move.fromRow, col: move.fromCol },
        to: { row: move.toRow, col: move.toCol },
      }

      const evalScore = alphaBeta(
        newBoard,
        depth - 1,
        alpha,
        beta,
        true,
        color,
        style,
        newLastMove,
      )

      if (evalScore < minEval) {
        minEval = evalScore
      }
      if (evalScore < beta) {
        beta = evalScore
      }
      if (beta <= alpha) {
        break // Alpha 剪枝
      }
    }

    return minEval
  }
}

// ============================================================
// 获取 AI 最佳走法（公开 API）
// ============================================================
export function getBestAIMove(
  board: Board,
  color: Color,
  difficulty: AIDifficulty,
  style: AIStyle,
  lastMove: { from: Square; to: Square } | null,
): AIDetailedMove | null {
  const moves = getAllLegalMovesWithSources(board, color, lastMove)
  if (moves.length === 0) return null

  // 只有一种走法时直接返回
  if (moves.length === 1) return moves[0]!

  // 根据难度确定搜索深度
  const depthMap: Record<AIDifficulty, number> = {
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,
  }
  const depth = depthMap[difficulty]

  const orderedMoves = orderMoves(board, moves)

  let bestMoves: AIDetailedMove[] = []
  let bestScore = -Infinity

  for (const move of orderedMoves) {
    const newBoard = simulateMove(board, move)
    const newLastMove: { from: Square; to: Square } = {
      from: { row: move.fromRow, col: move.fromCol },
      to: { row: move.toRow, col: move.toCol },
    }

    // AI 走完后，轮到对手（最小化方）
    const score = alphaBeta(
      newBoard,
      depth - 1,
      -Infinity,
      Infinity,
      false,
      color,
      style,
      newLastMove,
    )

    // 不可预测风格：添加小的随机波动
    let adjustedScore = score
    if (style === 'unpredictable') {
      adjustedScore += (Math.random() - 0.5) * 50
    }

    if (adjustedScore > bestScore) {
      bestScore = adjustedScore
      bestMoves = [move]
    } else if (Math.abs(adjustedScore - bestScore) < 1) {
      // 几乎相等的走法，加入候选
      bestMoves.push(move)
    }
  }

  // 从最佳走法中随机选择（增加不可预测性，特别是低难度）
  if (difficulty <= 2 || style === 'unpredictable') {
    const randomIndex = Math.floor(Math.random() * bestMoves.length)
    return bestMoves[randomIndex]!
  }

  // 高难度：如果有多条等价最优走法，也随机选一条
  return bestMoves[Math.floor(Math.random() * bestMoves.length)]!
}

// ============================================================
// 判断兵升变时应选择的棋子类型
// AI 总是选择后，除非特别情况下选马
// ============================================================
export function getPromotionChoice(
  board: Board,
  toRow: number,
  toCol: number,
  color: Color,
): 'queen' | 'knight' | 'rook' | 'bishop' {
  // 默认升变为后
  // 检查升变为马是否能将军（有时升变为马是更好的选择）
  const enemyKingRow = findKingRow(board, color === 'white' ? 'black' : 'white')
  const enemyKingCol = findKingCol(board, color === 'white' ? 'black' : 'white')

  const knightOffsets = [
    [2, 1], [2, -1], [-2, 1], [-2, -1],
    [1, 2], [1, -2], [-1, 2], [-1, -2],
  ]

  for (const offset of knightOffsets) {
    const dRow = offset[0]!
    const dCol = offset[1]!
    if (toRow + dRow === enemyKingRow && toCol + dCol === enemyKingCol) {
      return 'knight' // 升变为马可以将军
    }
  }

  return 'queen'
}

// ============================================================
// 获取棋盘上可走的法总数（用于AI思考时间模拟等）
// ============================================================
export function getTotalLegalMoveCount(
  board: Board,
  color: Color,
  lastMove: { from: Square; to: Square } | null,
): number {
  return getAllLegalMovesWithSources(board, color, lastMove).length
}

// ============================================================
// 快速评估棋局（用于简单的棋子价值评估，不考虑位置）
// ============================================================
export function getMaterialAdvantage(board: Board, color: Color): number {
  let score = 0
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row]?.[col]
      if (!piece) continue
      const value = PIECE_VALUES[piece.type] ?? 0
      score += piece.color === color ? value : -value
    }
  }
  return score
}