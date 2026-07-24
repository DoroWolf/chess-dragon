<template>
  <div class="remote-overlay">
    <section v-if="remoteScreen === 'home'" class="remote-home-fullscreen">
      <h2 class="remote-home-title">远程对局</h2>
      <div class="remote-home-buttons">
        <button class="btn btn-home" @click="createRoom">创建对局</button>
        <button class="btn btn-home" @click="showJoinScreen">加入对局</button>
        <button class="btn btn-home" @click="$emit('back')">返回首页</button>
      </div>
    </section>

    <div v-else class="remote-card-mask">
      <section v-if="remoteScreen === 'setup'" class="remote-card">
        <div class="setup-section">
          <h3>棋盘</h3>
          <div class="option-group">
            <label class="option-card">
              <input v-model="boardMode" type="radio" value="standard" />
              <span>标准棋盘</span>
            </label>
            <label class="option-card">
              <input v-model="boardMode" type="radio" value="chess960" />
              <span>Chess960</span>
            </label>
            <label class="option-card">
              <input v-model="boardMode" type="radio" value="custom" />
              <span>自定义棋盘</span>
            </label>
          </div>
          <input v-if="boardMode === 'custom'" v-model="fenInput" type="text" class="fen-input"
            placeholder="在此处粘贴 FEN 文本" />
          <p v-if="boardMode === 'custom' && fenInput.trim() && !isFenValid" class="fen-hint">无效的 FEN</p>
        </div>

        <div class="setup-section">
          <h3>棋钟</h3>
          <label class="slider-row">
            <span>限时</span>
            <input v-model.number="timeMinutes" type="range" min="0" max="180" step="1" />
            <strong>{{ timeMinutes === 0 ? '无限制' : `${timeMinutes} 分钟` }}</strong>
          </label>
          <label v-if="timeMinutes > 0" class="slider-row">
            <span>每步加时</span>
            <input v-model.number="incrementSeconds" type="range" min="0" max="30" step="1" />
            <strong>{{ incrementSeconds }} 秒</strong>
          </label>
        </div>

        <div class="setup-section">
          <h3>先手方</h3>
          <div class="option-group">
            <label class="option-card">
              <input v-model="starter" type="radio" value="white" />
              <span>白方</span>
            </label>
            <label class="option-card">
              <input v-model="starter" type="radio" value="random" />
              <span>随机</span>
            </label>
            <label class="option-card">
              <input v-model="starter" type="radio" value="black" />
              <span>黑方</span>
            </label>
          </div>
        </div>

        <div class="setup-actions">
          <button type="button" class="btn " @click="backToRemoteHome">返回</button>
          <button type="button" class="btn btn-primary start-btn" :disabled="!canProceed" @click="confirmSetup">
            创建房间
          </button>
        </div>
      </section>

      <!-- 已创建房间：显示房间码 -->
      <section v-else-if="remoteScreen === 'created'" class="remote-card">
        <h2 class="remote-card-title">房间已创建</h2>
        <p class="remote-card-desc">将以下房间码发送给对手</p>
        <div class="room-code-display">
          <span v-for="(char, idx) in roomCode.split('')" :key="idx" class="code-char">{{ char }}</span>
        </div>
        <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
        <p v-else class="remote-hint">等待对手加入中...</p>
        <div class="setup-actions">
          <button type="button" class="btn " @click="backToRemoteHome">取消</button>
        </div>
      </section>

      <!-- 加入对局：输入房间码 -->
      <section v-else-if="remoteScreen === 'joining'" class="remote-card">
        <h2 class="remote-card-title">加入房间</h2>
        <p class="remote-card-desc">输入对手分享的房间码</p>
        <div class="join-input-wrapper">
          <input
            v-model="joinInput"
            type="text"
            class="join-code-input"
            maxlength="6"
            placeholder="输入6位房间码"
            @input="onJoinInput"
            @keyup.enter="joinRoom"
          />
        </div>
        <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
        <div class="setup-actions">
          <button type="button" class="btn " @click="backToRemoteHome">返回</button>
          <button type="button" class="btn  btn-primary" :disabled="joinInput.length !== 6" @click="joinRoom">
            加入
          </button>
        </div>
      </section>

      <!-- 双方匹配成功：准备确认 -->
      <section v-else-if="remoteScreen === 'waitReady' || remoteScreen === 'ready'" class="remote-card">
        <h2 class="remote-card-title">
          <template v-if="isHost">有对手加入</template>
          <template v-else>已加入房间</template></h2>

        <div class="ready-status">
          <div class="ready-player">
            <span class="ready-label">我</span>
            <span class="ready-icon" :class="{ ready: iAmReady }">{{ iAmReady ? '✓' : '·' }}</span>
          </div>
          <span class="ready-vs">VS</span>
          <div class="ready-player">
            <span class="ready-label">对手</span>
            <span class="ready-icon" :class="{ ready: opponentReady }">{{ opponentReady ? '✓' : '·' }}</span>
          </div>
        </div>

        <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
        <p v-else-if="iAmReady && !opponentReady" class="remote-hint">已准备，等待对手确认...</p>
        <p v-else-if="!iAmReady && opponentReady" class="remote-hint">对手已准备，请点击准备按钮</p>
        <p v-else-if="!iAmReady && !opponentReady" class="remote-hint">双方点击「准备」开始对局</p>

        <div class="setup-actions">
          <button type="button" class="btn " @click="backToRemoteHome">离开</button>
          <button v-if="!iAmReady" type="button" class="btn  btn-primary ready-btn" @click="setReady">
            准备
          </button>
          <button v-else type="button" class="btn  btn-cancel" @click="cancelReady">
            取消准备
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRemoteGame } from '../composables/useRemoteGame'
import type { GameSetupConfig } from './GameSetup.vue'
import { titleImg } from '../assets/resourcePaths'

const emit = defineEmits<{
  start: [config: GameSetupConfig]
  back: []
}>()

// ---- 远程对局核心逻辑 ----
const {
  remoteScreen,
  roomCode,
  isHost,
  opponentReady,
  iAmReady,
  errorMessage,
  joinInput,
  createRoom: remoteCreateRoom,
  onSetupComplete,
  showJoinScreen: remoteShowJoinScreen,
  joinRoom: remoteJoinRoom,
  setReady: remoteSetReady,
  cancelReady: remoteCancelReady,
  backToRemoteHome: remoteBackToHome,
} = useRemoteGame()

// ---- 对局设置状态 ----
const boardMode = ref<'standard' | 'custom' | 'chess960'>('standard')
const fenInput = ref('')
const chess960Id = ref(518)
const timeMinutes = ref(10)
const incrementSeconds = ref(0)
const starter = ref<'black' | 'random' | 'white'>('white')

// ---- 封装方法以桥接 ----
const createRoom = () => {
  remoteCreateRoom()
}

const showJoinScreen = () => {
  remoteShowJoinScreen()
}

const joinRoom = () => {
  remoteJoinRoom()
}

const setReady = () => {
  remoteSetReady()
}

const cancelReady = () => {
  remoteCancelReady()
}

const backToRemoteHome = () => {
  remoteBackToHome()
}

const onJoinInput = () => {
  joinInput.value = joinInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// ---- FEN 验证 ----
const validateFen = (fen: string): boolean => {
  const trimmed = fen.trim()
  if (!trimmed) return false
  const parts = trimmed.split(/\s+/)
  if (parts.length < 2) return false
  const boardPart = parts[0]
  if (!boardPart) return false
  const rows = boardPart.split('/')
  if (rows.length !== 8) return false
  for (const row of rows) {
    let colCount = 0
    for (const char of row) {
      if (/\d/.test(char)) {
        colCount += Number.parseInt(char, 10)
      } else if (/[prnbqkPRNBQK]/.test(char)) {
        colCount += 1
      } else {
        return false
      }
    }
    if (colCount !== 8) return false
  }
  const turnPart = parts[1]
  if (turnPart !== 'w' && turnPart !== 'b') return false
  return true
}

const isFenValid = computed(() => {
  if (boardMode.value !== 'custom') return true
  const trimmed = fenInput.value.trim()
  if (!trimmed) return true
  return validateFen(trimmed)
})

const canProceed = computed(() => {
  if (boardMode.value === 'custom') {
    const trimmed = fenInput.value.trim()
    if (!trimmed) return false
    return isFenValid.value
  }
  return true
})

// ---- Chess960 生成 ----
const generateChess960 = () => {
  chess960Id.value = Math.floor(Math.random() * 960) + 1
}

watch(boardMode, (newMode) => {
  if (newMode === 'chess960') {
    generateChess960()
  }
})

const buildChess960Fen = (): string => {
  const pieces = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'] as const
  const shuffleArray = <T,>(arr: T[]): T[] => {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const tmp = a[i]!
      a[i] = a[j]!
      a[j] = tmp
    }
    return a
  }
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const shuffled = shuffleArray([...pieces])
    const bishopIndices = shuffled.reduce<number[]>((acc, p, i) => {
      if (p === 'b') acc.push(i)
      return acc
    }, [])
    const b1Color = bishopIndices[0]! % 2
    const b2Color = bishopIndices[1]! % 2
    if (b1Color === b2Color) continue
    const kingIdx = shuffled.indexOf('k')
    const rookIndices = shuffled.reduce<number[]>((acc, p, i) => {
      if (p === 'r') acc.push(i)
      return acc
    }, [])
    if (kingIdx < rookIndices[0]! || kingIdx > rookIndices[1]!) continue
    const backRankLower = shuffled.join('')
    const backRankUpper = backRankLower.toUpperCase()
    const emptyRow = '8'
    return `${backRankLower}/pppppppp/${emptyRow}/${emptyRow}/${emptyRow}/${emptyRow}/PPPPPPPP/${backRankUpper} w KQkq - 0 1`
  }
}

// ---- 确认设置并创建房间 ----
const confirmSetup = () => {
  onSetupComplete()
}

// ---- 监听 starting 状态，触发开始 ----
watch(remoteScreen, (newScreen) => {
  if (newScreen === 'starting') {
    let finalFen = ''
    if (boardMode.value === 'custom') {
      finalFen = fenInput.value.trim()
    } else if (boardMode.value === 'chess960') {
      finalFen = buildChess960Fen()
    }

    emit('start', {
      boardMode: boardMode.value,
      fen: finalFen,
      timeMinutes: timeMinutes.value,
      incrementSeconds: timeMinutes.value === 0 ? 0 : incrementSeconds.value,
      starter: starter.value,
      gameMode: 'remote',
      difficulty: 3,
      aiStyle: 'balanced',
    })
  }
})
</script>

<style scoped>
.remote-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background-color: #f0f0f0;
}

.remote-home-fullscreen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
  text-align: center;
  padding: 20px;
}

.remote-home-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
}

.remote-home-buttons {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 260px;
  margin-top: 24px;
}

.btn-home {
  width: 100%;
  padding: 14px 0;
  font-size: 1.15rem;
  font-weight: 600;
  background: #fff;
  color: #212529;
}

/* ============================================================ */
/* 卡片式弹窗遮罩 */
/* ============================================================ */
.remote-card-mask {
  position: absolute;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  background-color: #f0f0f0;
}

/* ============================================================ */
/* 卡片面板 */
/* ============================================================ */
.remote-card {
  width: min(480px, 100%);
  max-height: 90vh;
  overflow: auto;
  background: #fff;
  box-shadow: 2px 2px 0 #909294;
  padding: 24px;
}

.remote-card-title {
  margin: 0 0 8px;
  font-size: 1.2rem;
  font-weight: 700;
  text-align: center;
}

.remote-card-desc {
  margin: 0 0 20px;
  text-align: center;
  color: #666;
  font-size: 0.95rem;
}

.room-code-display {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin: 16px 0;
}

.code-char {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 56px;
  font-size: 1.5rem;
  font-weight: 700;
  font-family: 'Unifont', monospace;
  background: #212529;
  color: #ffd33d;
  letter-spacing: 2px;
}

.remote-hint {
  margin: 8px 0 20px;
  color: #888;
  font-size: 0.9rem;
  text-align: center;
}

/* ---- 加入输入框 ---- */
.join-input-wrapper {
  margin: 16px 0;
  display: flex;
  justify-content: center;
}

.join-code-input {
  width: 240px;
  padding: 12px 16px;
  font-size: 1.4rem;
  font-weight: 700;
  font-family: 'Unifont', monospace;
  text-align: center;
  letter-spacing: 6px;
  border: 2px solid #212529;
  outline: none;
  text-transform: uppercase;
}

.join-code-input:focus {
  border-color: #ffd33d;
  box-shadow: 0 0 0 2px rgba(255, 211, 61, 0.3);
}

.join-code-input::placeholder {
  font-size: 0.85rem;
  font-weight: 400;
  letter-spacing: 1px;
  color: #ccc;
}

/* ---- 准备确认 ---- */
.ready-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  margin: 20px 0;
}

.ready-player {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.ready-label {
  font-size: 0.9rem;
  color: #666;
}

.ready-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  font-size: 1.5rem;
  font-weight: 700;
  border: 2px solid #d0d0d0;
  color: #ccc;
  transition: all 0.2s;
}

.ready-icon.ready {
  border-color: #28a745;
  background: #28a745;
  color: #fff;
}

.ready-vs {
  font-size: 1.2rem;
  font-weight: 700;
  color: #999;
}

.ready-btn {
  flex: 1;
}

/* ---- 设置面板 ---- */
.setup-section {
  margin-bottom: 16px;
}

.setup-section h3 {
  margin: 0 0 8px;
  font-size: 1rem;
}

.option-group {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.option-card {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid #d0d0d0;
  cursor: pointer;
}

.fen-input {
  width: 100%;
  box-sizing: border-box;
  margin-top: 8px;
  padding: 8px;
  border: 1px solid #d0d0d0;
}

.fen-hint {
  margin: 4px 0 0;
  color: #c33;
  font-size: 0.85rem;
}

.slider-row {
  display: grid;
  grid-template-columns: 120px 1fr auto;
  gap: 10px;
  align-items: center;
  margin-bottom: 8px;
}

/* ---- 按钮通用 ---- */
.setup-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.start-btn {
  flex: 1;
}

.btn-cancel {
  flex: 1;
  border: 2px solid #dc3545;
  background: #fff;
  color: #dc3545;
}

.btn-cancel:hover {
  background: #dc3545;
  color: #fff;
}

/* ---- 错误消息 ---- */
.error-message {
  margin: 8px 0 0;
  color: #c33;
  font-size: 0.9rem;
  text-align: center;
  font-weight: 600;
}
</style>