import { api } from '../lib/api'

/**
 * Downscale big screenshots client-side (max 1400px, JPEG 0.85) so a
 * screenshot costs ~100-200 KB, then upload and return the stored URL.
 */
export async function processAndUpload(blob: Blob): Promise<string> {
  const small = await shrink(blob)
  const { url } = await api.uploadImage(small)
  return url
}

function shrink(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const MAX = 1400
      const w = img.naturalWidth, h = img.naturalHeight
      const scale = Math.min(1, MAX / Math.max(w, h))
      if (scale === 1 && blob.size <= 250 * 1024) { resolve(blob); return }
      const cw = Math.round(w * scale), ch = Math.round(h * scale)
      const cv = document.createElement('canvas')
      cv.width = cw; cv.height = ch
      const ctx = cv.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, cw, ch)
      ctx.drawImage(img, 0, 0, cw, ch)
      cv.toBlob(b => b ? resolve(b) : reject(new Error('encode failed')), 'image/jpeg', 0.85)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not an image')) }
    img.src = url
  })
}

export function fmtBytes(b: number): string {
  if (b < 1024) return b + ' B'
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB'
  return (b / (1024 * 1024)).toFixed(1) + ' MB'
}
