<template>
  <div class="promotion" :style="computedStyle">
    <button 
      v-for="p in pieces" 
      :key="p" 
      type="button" 
      class="promote-btn" 
      @click="$emit('select', p)"
    >
      <img :src="`./texture/promotion/promotion_${p}_${color}.png`" :alt="p" draggable="false" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from 'vue'

const props = defineProps<{ 
  color: 'white' | 'black'; 
  style?: CSSProperties 
}>()

defineEmits<{
  (e: 'select', piece: string): void
}>()

const pieces = computed(() => {
  return props.color === 'white' 
    ? ['queen', 'knight', 'rook', 'bishop'] 
    : ['bishop', 'rook', 'knight', 'queen']
})

// 如果父级传入的 style 包含位置，这里做一个简单的容错和整合
const computedStyle = computed(() => ({
  ...props.style,
}))
</script>

<style scoped>
.promotion {
  position: absolute;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: stretch;
  background: #ffffff;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
  z-index: 60;
  overflow: hidden;

  /* 保证像素风格纹理渲染清晰 */
  image-rendering: pixelated;
  image-rendering: crisp-edges;

  -webkit-user-select: none;
  -moz-user-select: none;
  user-select: none;
}

.promote-btn {
  all: unset;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  
  width: 100%;
  aspect-ratio: 1 / 1; 
  
  cursor: pointer;
}

.promote-btn:hover {
  background: rgba(0, 0, 0, 0.08);
}

.promote-btn img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  box-sizing: border-box;

  image-rendering: pixelated;
  image-rendering: crisp-edges;
}
</style>