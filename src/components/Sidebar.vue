<template>
  <aside class="sidebar">
    <div class="nes-container game-status">
      <div v-if="gameStatus" class="status-message">{{ gameStatus }}</div>
      <div v-else class="current-turn">当前轮次：{{ currentTurn === 'white' ? '白棋' : '黑棋' }}</div>
    </div>

    <!-- 棋谱显示区 -->
    <div class="nes-container with-title">
      <div class="title-bar">
        <p class="title">棋谱</p>
        <button
          type="button"
          class="nes-btn is-primary copy-btn"
          :disabled="moveHistory.length === 0"
          @click="copyPGN"
        >
          {{ copyStatusText }}
        </button>
      </div>

      <div class="moves-list">
        <!-- 按回合渲染：每行格式为 "1. e4 e5" -->
        <div
          v-for="turn in movePairs"
          :key="turn.number"
          :class="['move-pair', { 'last-move-pair': turn.number === movePairs.length }]"
        >
          <span class="move-number">{{ turn.number }}.</span>
          <span class="move-white">{{ turn.white }}</span>
          <span class="move-black">{{ turn.black || '' }}</span>
        </div>
        <div v-if="moveHistory.length === 0" class="no-moves">游戏未开始</div>
      </div>
    </div>

    <!-- 控制按钮 -->
    <div class="button-group">
      <button
        type="button"
        class="nes-btn is-warning"
        :disabled="isButtonsDisabled"
        @click="$emit('undo')"
      >
        悔棋
      </button>
      <button
        type="button"
        class="nes-btn is-success"
        :disabled="isButtonsDisabled"
        @click="handleDrawClick"
      >
        {{ isClaimableDraw ? '宣告和棋' : '申请和棋' }}
      </button>
      <button
        type="button"
        class="nes-btn is-error"
        :disabled="isButtonsDisabled"
        @click="handleResignClick"
      >
        投降
      </button>
    </div>

    <!-- 二次确认弹窗 Modal -->
    <div v-if="showConfirmModal" class="modal-backdrop">
      <div class="nes-container dialog-box">
        <p class="dialog-title">确认提示</p>
        <p class="dialog-message">{{ confirmMessage }}</p>
        <div class="dialog-buttons">
          <button type="button" class="nes-btn" @click="cancelConfirm">取消</button>
          <button type="button" class="nes-btn is-primary" @click="executeConfirm">确认</button>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Color } from '../models/chess'

interface Props {
  moveHistory: string[]
  currentTurn: Color
  gameStatus?: string
  halfmoveClock?: number
  positionCount?: number
}

interface MovePair {
  number: number
  white: string
  black?: string
}

const props = withDefaults(defineProps<Props>(), {
  gameStatus: undefined,
  halfmoveClock: 0,
  positionCount: 1,
})

const emit = defineEmits<{
  undo: []
  draw: []
  resign: []
}>()

const copyStatusText = ref('复制')

// 确认弹窗状态
const showConfirmModal = ref(false)
const confirmMessage = ref('')
const pendingAction = ref<'draw' | 'resign' | null>(null)

// 当游戏未开始（无历史）或游戏已结束（有 status 消息）时禁用按钮
const isButtonsDisabled = computed(() => {
  return props.moveHistory.length === 0 || !!props.gameStatus
})

// 是否达到「宣告和棋」的条件（50步规则，即100半步；或3次重复局面）
const isClaimableDraw = computed(() => {
  return props.halfmoveClock >= 100 || props.positionCount >= 3
})

// 将单步数组格式化为两步一回合的结构
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

// 生成标准 PGN 格式文本 (例: "1. e4 e5 2. Nf3 Nc6")
const pgnText = computed(() => {
  return movePairs.value
    .map((pair) => {
      return pair.black
        ? `${pair.number}. ${pair.white} ${pair.black}`
        : `${pair.number}. ${pair.white}`
    })
    .join(' ')
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

// 按钮点击处理
const handleDrawClick = () => {
  if (isClaimableDraw.value) {
    // 符合规则，直接宣告和棋，无需确认
    emit('draw')
  } else {
    // 正常申请和棋，弹出确认框
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

/* 标题与复制按钮栏 */
.title-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2px solid #212529;
  padding: 0.25rem 0;
  background-color: #fff;
}

:deep(.nes-container .title) {
  margin: 0;
  padding: 0 0.5rem;
  font-weight: bold;
  border-bottom: none;
}

.copy-btn {
  font-size: 0.7rem !important;
  padding: 2px 6px !important;
  margin-right: 0.25rem;
}

/* 棋谱显示区 */
.moves-list {
  height: 240px;
  overflow-y: auto;
  padding: 0.5rem;
  background-color: #fff;
  border: 2px solid #212529;
  margin-top: 0.5rem;
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

.no-moves {
  text-align: center;
  color: #999;
  padding: 1rem;
  font-style: italic;
  font-family: 'Unifont', system-ui;
}

.game-status {
  padding: 0.75rem;
  text-align: center;
  font-weight: bold;
}

.status-message {
  color: #e44536;
  font-size: 0.9rem;
}

.current-turn {
  color: #212529;
  font-size: 0.9rem;
}

/* 修改：控制按钮排为单行，并缩小内边距和字号 */
.button-group {
  display: flex;
  flex-direction: row;
  gap: 0.25rem;
  width: 100%;
}

.button-group .nes-btn {
  flex: 1;
  width: auto;
  font-family: 'Unifont', system-ui;
  font-size: 0.7rem;
  padding: 0.35rem 0.15rem;
  white-space: nowrap;
  cursor: pointer;
  border: 2px solid #212529;
  text-align: center;
}

.button-group .nes-btn:disabled,
.copy-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.button-group .nes-btn:not(:disabled):hover {
  transform: translateY(-2px);
}

.moves-list::-webkit-scrollbar {
  width: 8px;
}

.moves-list::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.moves-list::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 4px;
}

.moves-list::-webkit-scrollbar-thumb:hover {
  background: #555;
}

:deep(.nes-container) {
  border: 2px solid #212529;
  background-color: #fff;
  padding: 1rem;
  box-shadow: 2px 2px 0 #212529;
}

:deep(.nes-container.with-title) {
  padding-top: 0;
}

/* 弹窗样式 */
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
  max-width: 260px;
  width: 90%;
  text-align: center;
}

.dialog-title {
  font-weight: bold;
  margin-bottom: 0.5rem;
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

.dialog-buttons .nes-btn {
  flex: 1;
  font-size: 0.8rem;
  padding: 0.25rem 0.5rem;
}
</style>