<template>
  <div class="mo-photos">
    <span class="mo-photos-label">Photos (the first one is the cover)</span>
    <div v-if="modelValue.length" class="mo-photos-grid">
      <div v-for="(url, i) in modelValue" :key="url" class="mo-photo">
        <img :src="url" alt="" loading="lazy" />
        <span v-if="i === 0" class="mo-photo-cover">Cover</span>
        <div class="mo-photo-actions">
          <button v-if="i > 0" type="button" @click="makeCover(i)">Make cover</button>
          <button type="button" @click="remove(i)">Remove</button>
        </div>
      </div>
    </div>
    <p v-if="msg" class="mo-photos-msg" role="alert">{{ msg }}</p>
    <label class="mo-photos-add">
      <input type="file" accept="image/*" multiple :disabled="busy" @change="pick" />
      <span>{{ busy ? 'Uploading…' : modelValue.length ? '+ Add more photos' : '+ Add photos from your device' }}</span>
    </label>
  </div>
</template>

<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'

const props = defineProps<{ modelValue: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()
const { api } = useAuth()
const busy = ref(false)
const msg = ref('')
const MAX = 12

function remove(i: number) {
  emit('update:modelValue', props.modelValue.filter((_, n) => n !== i))
}
function makeCover(i: number) {
  const list = [...props.modelValue]
  const [item] = list.splice(i, 1)
  emit('update:modelValue', [item, ...list])
}

// Shrinks a photo in the browser so it uploads fast and stays small.
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no canvas')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
    return dataUrl.slice(dataUrl.indexOf(',') + 1)
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function pick(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  if (!files.length) return
  msg.value = ''
  busy.value = true
  const list = [...props.modelValue]
  try {
    for (const file of files) {
      if (list.length >= MAX) {
        msg.value = `You can add up to ${MAX} photos.`
        break
      }
      try {
        const data = await shrink(file)
        const res = await api<{ url: string }>('/api/properties/upload', {
          method: 'POST',
          body: { data, type: 'image/jpeg' },
        })
        list.push(res.url)
        emit('update:modelValue', [...list])
      } catch (err: any) {
        msg.value = err?.statusMessage || err?.data?.statusMessage || `Could not add ${file.name}. Try a JPG or PNG photo.`
      }
    }
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.mo-photos { margin-bottom: 16px; }
.mo-photos-label { display: block; font-size: 0.85rem; margin-bottom: 8px; opacity: 0.8; }
.mo-photos-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; margin-bottom: 10px; }
.mo-photo { position: relative; border-radius: 10px; overflow: hidden; border: 1px solid rgba(128,128,128,0.3); }
.mo-photo img { display: block; width: 100%; height: 100px; object-fit: cover; }
.mo-photo-cover { position: absolute; top: 6px; left: 6px; background: #ff4b33; color: #fff; font-size: 0.7rem; padding: 2px 8px; border-radius: 10px; }
.mo-photo-actions { display: flex; gap: 4px; padding: 6px; flex-wrap: wrap; }
.mo-photo-actions button { font-size: 0.75rem; padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(128,128,128,0.5); background: transparent; color: inherit; cursor: pointer; }
.mo-photos-msg { color: #d32f2f; font-size: 0.85rem; margin: 0 0 8px; }
.mo-photos-add { display: inline-block; cursor: pointer; }
.mo-photos-add input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.mo-photos-add span { display: inline-block; padding: 10px 16px; border-radius: 8px; border: 1px dashed rgba(128,128,128,0.7); }
</style>
