import { ref, computed, onUnmounted } from 'vue'

// ============================================================
// 远程对局流程状态机
// ============================================================
export type RemoteScreen =
  | 'home'        // 创建/加入选择页
  | 'setup'       // 对局设置页（创建者）
  | 'created'     // 已创建对局，显示房间码，等待对手加入
  | 'joining'     // 正在输入房间码准备加入
  | 'waitReady'   // 已匹配，等待双方准备
  | 'ready'       // 我方已准备，等待对方准备
  | 'starting'    // 双方已准备，即将开始

// ============================================================
// 远程对局消息协议
// ============================================================
export interface RemoteMessage {
  type: 'join' | 'joined' | 'ready' | 'start' | 'leave' | 'reject'
  roomId: string
  payload?: unknown
}

// ============================================================
// 生成6位随机房间码
// ============================================================
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 去掉容易混淆的字符 0O1I
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

// ============================================================
// useRemoteGame composable
// ============================================================
export function useRemoteGame() {
  // ---- 状态 ----
  const remoteScreen = ref<RemoteScreen>('home')
  const roomCode = ref('')
  const isHost = ref(false)
  const opponentReady = ref(false)
  const iAmReady = ref(false)
  const errorMessage = ref('')
  const joinInput = ref('')
  const channelName = ref('')

  let channel: BroadcastChannel | null = null

  // ---- 计算属性 ----
  const isMatched = computed(() => remoteScreen.value === 'waitReady' || remoteScreen.value === 'ready')
  const bothReady = computed(() => iAmReady.value && opponentReady.value)
  const canStart = computed(() => bothReady.value)

  // ---- 清理 channel ----
  const closeChannel = () => {
    if (channel) {
      channel.close()
      channel = null
    }
  }

  onUnmounted(() => {
    closeChannel()
  })

  // ---- 监听对方消息 ----
  const startListening = (chName: string) => {
    closeChannel()
    channelName.value = chName
    channel = new BroadcastChannel(chName)

    channel.onmessage = (event: MessageEvent<RemoteMessage>) => {
      const msg = event.data
      if (msg.roomId !== roomCode.value && msg.type !== 'leave') return

      switch (msg.type) {
        case 'join':
          // 创建者收到加入请求，自动同意
          if (isHost.value && remoteScreen.value === 'created') {
            channel?.postMessage({
              type: 'joined',
              roomId: roomCode.value,
            } satisfies RemoteMessage)
            remoteScreen.value = 'waitReady'
            errorMessage.value = ''
          }
          break

        case 'joined':
          // 加入者收到同意回复
          if (!isHost.value && remoteScreen.value === 'joining') {
            remoteScreen.value = 'waitReady'
            errorMessage.value = ''
          }
          break

        case 'ready':
          // 任一方收到对方准备通知
          opponentReady.value = true
          // 如果我也准备好了，双方都就绪，发送开始
          if (iAmReady.value && !bothReady.value) {
            // 通过 setReady 中的检查，这里直接发送 start
            channel?.postMessage({
              type: 'start',
              roomId: roomCode.value,
              payload: { starter: 'white' },
            } satisfies RemoteMessage)
            remoteScreen.value = 'starting'
          }
          break

        case 'start':
          // 双方准备完毕，开始对局
          if (bothReady.value || (msg.payload as { starter: string })) {
            remoteScreen.value = 'starting'
          }
          break

        case 'leave':
          // 对方离开
          errorMessage.value = '对方已离开对局'
          opponentReady.value = false
          if (remoteScreen.value === 'ready') {
            remoteScreen.value = 'waitReady'
          }
          break

        case 'reject':
          errorMessage.value = '加入被拒绝或房间不存在'
          break
      }
    }

    channel.onmessageerror = () => {
      errorMessage.value = '通信错误，请重试'
    }
  }

  // ---- 创建对局 ----
  const createRoom = () => {
    const code = generateRoomCode()
    roomCode.value = code
    isHost.value = true
    iAmReady.value = false
    opponentReady.value = false
    errorMessage.value = ''
    joinInput.value = ''
    remoteScreen.value = 'setup'
  }

  // ---- 设置完成，进入等待 ----
  const onSetupComplete = () => {
    if (!isHost.value) return
    startListening(`chess-dragon-${roomCode.value}`)
    remoteScreen.value = 'created'
  }

  // ---- 显示加入对局输入界面 ----
  const showJoinScreen = () => {
    remoteScreen.value = 'joining'
    isHost.value = false
    iAmReady.value = false
    opponentReady.value = false
    errorMessage.value = ''
    joinInput.value = ''
  }

  // ---- 加入对局 ----
  const joinRoom = () => {
    const code = joinInput.value.trim().toUpperCase()
    if (code.length !== 6) {
      errorMessage.value = '请输入6位房间码'
      return
    }

    roomCode.value = code
    startListening(`chess-dragon-${code}`)

    // 发送加入请求
    channel?.postMessage({
      type: 'join',
      roomId: code,
    } satisfies RemoteMessage)

    // 设置超时，如果3秒内没收到回应则显示错误
    const timeout = setTimeout(() => {
      if (remoteScreen.value === 'joining') {
        errorMessage.value = '未找到该房间，请检查房间码是否正确'
      }
    }, 3000)

    // 清除超时（在 onmessage 中已切换到 waitReady 状态）
    const checkInterval = setInterval(() => {
      if (remoteScreen.value !== 'joining') {
        clearTimeout(timeout)
        clearInterval(checkInterval)
      }
    }, 100)
  }

  // ---- 我方准备 ----
  const setReady = () => {
    iAmReady.value = true
    remoteScreen.value = 'ready'
    channel?.postMessage({
      type: 'ready',
      roomId: roomCode.value,
    } satisfies RemoteMessage)

    // 如果双方都准备好了，发送开始信号
    if (bothReady.value) {
      channel?.postMessage({
        type: 'start',
        roomId: roomCode.value,
        payload: { starter: 'white' },
      } satisfies RemoteMessage)
      remoteScreen.value = 'starting'
    }
  }

  // ---- 取消准备（仅自己取消） ----
  const cancelReady = () => {
    iAmReady.value = false
    opponentReady.value = false
    remoteScreen.value = 'waitReady'
  }

  // ---- 返回远程首页（通知对方离开） ----
  const backToRemoteHome = () => {
    // 通知对方离开（BroadcastChannel.postMessage 是异步分发的，延迟关闭确保送达）
    if (channel && roomCode.value) {
      channel.postMessage({
        type: 'leave',
        roomId: roomCode.value,
      } satisfies RemoteMessage)
    }
    // 延迟关闭 channel，确保 leave 消息已被分发
    const ch = channel
    setTimeout(() => {
      ch?.close()
    }, 50)
    channel = null
    remoteScreen.value = 'home'
    roomCode.value = ''
    isHost.value = false
    iAmReady.value = false
    opponentReady.value = false
    errorMessage.value = ''
    joinInput.value = ''
  }

  return {
    // 状态
    remoteScreen,
    roomCode,
    isHost,
    opponentReady,
    iAmReady,
    errorMessage,
    joinInput,
    isMatched,
    bothReady,
    canStart,

    // 操作
    createRoom,
    onSetupComplete,
    showJoinScreen,
    joinRoom,
    setReady,
    cancelReady,
    backToRemoteHome,
    closeChannel,
  }
}