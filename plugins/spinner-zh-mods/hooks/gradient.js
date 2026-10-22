// 轮播与配色的纯函数，供 hooks 模块与测试共用。

export const ROTATION_MS = 4000
export const HUE_DEG_PER_SECOND = 70
export const HUE_SPAN = 140
export const SATURATION = 88
export const LIGHTNESS = 66

// 把 HSL 换算成 #rrggbb，色相取模到 [0, 360)。
export function hueToHex(hue, saturation = SATURATION, lightness = LIGHTNESS) {
  const h = ((hue % 360) + 360) % 360
  const s = saturation / 100
  const l = lightness / 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let rgb
  if (h < 60) rgb = [c, x, 0]
  else if (h < 120) rgb = [x, c, 0]
  else if (h < 180) rgb = [0, c, x]
  else if (h < 240) rgb = [0, x, c]
  else if (h < 300) rgb = [x, 0, c]
  else rgb = [c, 0, x]
  return (
    '#' +
    rgb
      .map((value) => Math.round((value + m) * 255).toString(16).padStart(2, '0'))
      .join('')
  )
}

// 同一帧内每个字符的色相依次推进，帧与帧之间整体相位前移，形成横向流动。
export function colorAt(index, length, now) {
  const phase = (now / 1000) * HUE_DEG_PER_SECOND
  const spread = (index / Math.max(1, length)) * HUE_SPAN
  return hueToHex(phase + spread)
}

// 按已等待时长取第几条文案；elapsed 为负或非有限值时退回第一条。
export function phraseAt(list, elapsed) {
  if (!Array.isArray(list) || list.length === 0) return ''
  const safe = Number.isFinite(elapsed) && elapsed > 0 ? elapsed : 0
  return list[Math.floor(safe / ROTATION_MS) % list.length]
}

// 每帧最多拆出的着色段数。文案最长 56 字符，逐字符拆分会得到 58 个元素，
// 而 spinner 每 100ms 重绘一次，因此长文案按段合并，段数不超过这个上限。
export const MAX_SEGMENTS = 24

// 把字符切成若干段，每段共用一个颜色。字符数不超过上限时一段对应一个字符。
export function segmentsOf(chars, maxSegments = MAX_SEGMENTS) {
  const total = chars.length
  if (total === 0) return []
  if (total <= maxSegments) return chars.map((char) => ({ text: char }))
  const size = Math.ceil(total / maxSegments)
  const segments = []
  for (let start = 0; start < total; start += size) {
    segments.push({ text: chars.slice(start, start + size).join('') })
  }
  return segments
}

// 帧间隔取重绘节流上限每秒 10 次对应的 100ms。
export const TICK_MS = 100
