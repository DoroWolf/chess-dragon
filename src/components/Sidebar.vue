<template>
  <aside class="sidebar">
    <ChessClock :is-clock-enabled="isClockEnabled" :white-time-seconds="whiteTimeSeconds"
      :black-time-seconds="blackTimeSeconds" :active-color="activeColor" :test-id="clockTestId" />

    <div class="card no-select game-status">
      <div v-if="gameStatus" class="status-message">{{ gameStatus }}</div>
      <div v-else class="current-turn">{{ currentTurn === 'white' ? '白棋' : '黑棋' }}执子</div>
    </div>

    <!-- 棋谱显示区 -->
    <div class="card with-title">
      <div class="moves-list">
        <div v-for="turn in movePairs" :key="turn.number"
          :class="['move-pair', { 'last-move-pair': turn.number === movePairs.length && !gameResult }]">
          <span class="move-number">{{ turn.number }}.</span>
          <span class="move-white">{{ turn.white }}</span>
          <span class="move-black">{{ turn.black || '' }}</span>
        </div>

        <!-- 将对局结果放在序号位置 -->
        <div v-if="gameResult" class="move-pair">
          <span class="move-number game-result-text">{{ gameResult }}</span>
        </div>
      </div>
    </div>

    <div v-if="isGameOver" class="button-group">
      <button type="button" class="btn settings-btn" @click="$emit('back-to-setup')">
        对局设置
      </button>
      <button type="button" class="btn btn-primary" @click="$emit('restart')">
        重赛
      </button>
    </div>
    <div v-else class="button-group">
      <button type="button" class="btn btn-warning" :disabled="isUndoDisabled" @click="$emit('undo')">
        悔棋
      </button>
      <button type="button" class="btn btn-success" :disabled="isGameActionDisabled" @click="handleDrawClick">
        {{ isClaimableDraw ? '宣告和棋' : '申请和棋' }}
      </button>
      <button type="button" class="btn btn-danger" :disabled="isGameActionDisabled" @click="handleResignClick">
        投降
      </button>
    </div>


    <!-- 二次确认弹窗 Modal -->
    <div v-if="showConfirmModal" class="modal-backdrop">
      <div class="card dialog-box">
        <p class="dialog-title">确认提示</p>
        <p class="dialog-message">{{ confirmMessage }}</p>
        <div class="dialog-buttons">
          <button type="button" class="btn" @click="cancelConfirm">取消</button>
          <button type="button" class="btn" @click="executeConfirm">确认</button>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Color } from '../models/chess'
import ChessClock from './ChessClock.vue'

interface Props {
  isClockEnabled?: boolean
  moveHistory: string[]
  currentTurn: Color
  gameStatus?: string
  halfmoveClock?: number
  positionCount?: number
  isGameOver?: boolean
  isFlipped: boolean
  isSoundEnabled: boolean
  coordinateLabelMode: 'off' | 'inside' | 'outside'
  whiteTimeSeconds?: number | null
  blackTimeSeconds?: number | null
  activeColor?: Color | null
  clockTestId?: string
  hasGameStarted?: boolean
}

interface MovePair {
  number: number
  white: string
  black?: string
}

const props = withDefaults(defineProps<Props>(), {
  isClockEnabled: true,
  gameStatus: undefined,
  halfmoveClock: 0,
  positionCount: 1,
  isGameOver: false,
  isFlipped: false,
  isSoundEnabled: true,
  coordinateLabelMode: 'inside',
  whiteTimeSeconds: null,
  blackTimeSeconds: null,
  activeColor: null,
  clockTestId: 'sidebar-chess-clock',
  hasGameStarted: false,
})

const emit = defineEmits<{
  undo: []
  draw: []
  resign: []
  restart: []
  'back-to-setup': []
  'toggle-flip': []
  'update:isSoundEnabled': [value: boolean]
  'update:coordinateLabelMode': [value: 'off' | 'inside' | 'outside']
}>()

const copyStatusText = ref('复制')

const showConfirmModal = ref(false)
const confirmMessage = ref('')
const pendingAction = ref<'draw' | 'resign' | null>(null)

const isUndoDisabled = computed(() => {
  return props.moveHistory.length === 0 || props.isGameOver || !!props.gameStatus
})

const isGameActionDisabled = computed(() => {
  const isStarted = props.hasGameStarted || props.moveHistory.length > 0
  return !isStarted || props.isGameOver || !!props.gameStatus
})

const isClaimableDraw = computed(() => {
  return props.halfmoveClock >= 100 || props.positionCount >= 3
})

const movePairs = computed<MovePair[]>(() => {
  const pairs: MovePair[] = []
  for (let i = 0; i < props.moveHistory.length; i += 2) {
    pairs.push({
      number: Math.floor(i / 2) + 1,
      white: props.moveHistory[i] || '...',
      black: props.moveHistory[i + 1],
    })
  }
  return pairs
})

const gameResult = computed(() => {
  if (!props.isGameOver && !props.gameStatus) return ''

  if (props.gameStatus?.includes('白棋胜利')) {
    return '1-0'
  }
  if (props.gameStatus?.includes('黑棋胜利')) {
    return '0-1'
  }
  if (props.gameStatus?.includes('和棋')) {
    return '1/2-1/2'
  }
  return ''
})

const pgnText = computed(() => {
  const moves = movePairs.value
    .map((pair) => {
      return pair.black
        ? `${pair.number}. ${pair.white} ${pair.black}`
        : `${pair.number}. ${pair.white}`
    })
    .join(' ')

  if (!moves) return ''

  return gameResult.value ? `${moves} ${gameResult.value}` : moves
})

const copyPGN = async () => {
  if (!pgnText.value) return
  try {
    await navigator.clipboard.writeText(pgnText.value)
    copyStatusText.value = '已复制！'
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = pgnText.value
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    copyStatusText.value = '已复制！'
  } finally {
    setTimeout(() => {
      copyStatusText.value = '复制'
    }, 2000)
  }
}

const handleDrawClick = () => {
  if (isClaimableDraw.value) {
    emit('draw')
  } else {
    confirmMessage.value = '确定要向对手申请和棋吗？'
    pendingAction.value = 'draw'
    showConfirmModal.value = true
  }
}

const handleResignClick = () => {
  const turnName = props.currentTurn === 'white' ? '白棋' : '黑棋'
  confirmMessage.value = `确定要让 ${turnName} 投降吗？`
  pendingAction.value = 'resign'
  showConfirmModal.value = true
}

const executeConfirm = () => {
  if (pendingAction.value === 'draw') {
    emit('draw')
  } else if (pendingAction.value === 'resign') {
    emit('resign')
  }
  cancelConfirm()
}

const cancelConfirm = () => {
  showConfirmModal.value = false
  confirmMessage.value = ''
  pendingAction.value = null
}
</script>

<style scoped>
@import url('https://fonts.cdnfonts.com/css/unifont');

.sidebar {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  width: 100%;
  max-width: 300px;
  background-color: #f0f0f0;
  font-family: 'Unifont', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #222;
}

.copy-btn {
  font-size: 0.7rem;
  padding: 2px 6px;
  margin-right: 0.25rem;
}

/* 棋谱显示区 */
.moves-list {
  height: 240px;
  overflow-y: auto;
  padding: 0.5rem;
  background-color: #fff;
  border: 2px solid #212529;
  margin-top: 1rem;
  font-family: 'Unifont', monospace;
}

.move-pair {
  display: flex;
  padding: 0.25rem;
  font-size: 0.9rem;
  line-height: 1.4;
  font-family: 'Unifont', monospace;
}

.move-number {
  font-weight: bold;
  width: 2.5em;
  color: #666;
  flex-shrink: 0;
}

.move-white,
.move-black {
  flex: 1;
  color: #212529;
}

.move-pair.last-move-pair {
  background-color: #fffacd;
}

.game-result-text {
  color: #666;
  width: auto;
}

.game-status {
  padding: 0.75rem;
  text-align: center;
  font-weight: bold;
}

.status-message,
.current-turn {
  color: #212529;
  font-size: 0.9rem;
}


.button-group {
  display: flex;
  flex-direction: row;
  gap: 0.25rem;
  width: 100%;
}

.button-group.Single-btn {
  display: block;
}

.button-group.Single-btn .restart-btn {
  width: 100%;
}

.button-group .btn {
  flex: 1;
  width: auto;
  padding: 0.35rem 0.15rem;
}

.moves-list::-webkit-scrollbar {
  width: 8px;
}

.moves-list::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.moves-list::-webkit-scrollbar-thumb {
  background: #888;
}

.moves-list::-webkit-scrollbar-thumb:hover {
  background: #555;
}

/* 弹窗布局专有样式 */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.dialog-box {
  background: white;
  padding: 1.5rem;
  max-width: 280px;
  width: 90%;
  text-align: center;
}

.dialog-title {
  font-weight: bold;
  margin-bottom: 0.75rem;
}

.dialog-message {
  font-size: 0.85rem;
  margin-bottom: 1rem;
}

.dialog-buttons {
  display: flex;
  justify-content: space-around;
  gap: 0.5rem;
}

.dialog-buttons .btn {
  flex: 1;
  font-size: 0.8rem;
  padding: 0.25rem 0.5rem;
}

.settings-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1rem;
  text-align: left;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
}

.setting-label {
  font-weight: bold;
}

.flip-btn {
  font-size: 0.7rem;
  padding: 2px 8px;
}

.custom-checkbox {
  width: 1rem;
  height: 1rem;
  cursor: pointer;
}

.select-wrapper {
  width: auto;
}
</style>