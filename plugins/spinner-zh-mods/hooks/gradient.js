// 轮播与配色的纯函数，供 hooks 模块与测试共用。
//
// 配色区分明色与暗色背景：原项目 dsh-status-rotator 也分昼/夜两套，
// 日间用深色（对白底对比度 4.8–7.1），夜间用浅色（对深底对比度 5.6–13.1）。
// 只用一套高亮度色会在浅色终端上看不清。
import { CATEGORIES, ALL_PHRASES } from './phrases.js'

export const ROTATION_MS = 4000

// 明色背景下使用的色相区间与饱和度/亮度：压低亮度以提高对白底的对比度。
export const LIGHT_SATURATION = 78
export const LIGHT_LIGHTNESS = 30

// 暗色背景下使用的色相区间与饱和度/亮度。
export const DARK_SATURATION = 85
export const DARK_LIGHTNESS = 68

// 明色背景不需要色相随时间偏移太多，否则仍有部分色相落到黄色段而变淡。
export const LIGHT_HUE_SPAN = 110
export const DARK_HUE_SPAN = 140

// 每秒色相推进角度。文档未提供逐帧渐变的速度参考，此值按观感取中。
export const HUE_DEG_PER_SECOND = 70

// 帧间隔取 ui.render 重绘节流上限每秒 10 次对应的 100ms。
export const TICK_MS = 100

// 每帧最多拆出的着色段数：文案最长 56 字符，逐字符拆分会产生 58 个元素，
// 每 100ms 重建一次；长文案按段合并以控制开销。
export const MAX_SEGMENTS = 24

// 相对亮度（WCAG 定义），用于判断背景深浅与估算对比度。
export function relativeLuminance(hex) {
  const value = parseInt(hex.slice(1), 16)
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const ratio = channel / 255
    return ratio <= 0.03928 ? ratio / 12.92 : Math.pow((ratio + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

// 对比度，返回值在 1 到 21 之间。
export function contrastRatio(a, b) {
  const first = relativeLuminance(a)
  const second = relativeLuminance(b)
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}

// 把 HSL 换算成 #rrggbb，色相取模到 [0, 360)。
export function hueToHex(hue, saturation = DARK_SATURATION, lightness = DARK_LIGHTNESS) {
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

// 明色背景用深一档的色，暗色背景用亮一档的色；两种情况下都取相同的色相推进节奏。
export function paletteFor(isLightBackground) {
  return isLightBackground
    ? { saturation: LIGHT_SATURATION, lightness: LIGHT_LIGHTNESS, span: LIGHT_HUE_SPAN }
    : { saturation: DARK_SATURATION, lightness: DARK_LIGHTNESS, span: DARK_HUE_SPAN }
}

// 同一帧内每个字符的色相依次推进，帧与帧之间整体相位前移，形成横向流动。
export function colorAt(index, length, now, isLightBackground = false) {
  const palette = paletteFor(isLightBackground)
  const phase = (now / 1000) * HUE_DEG_PER_SECOND
  const spread = (index / Math.max(1, length)) * palette.span
  return hueToHex(phase + spread, palette.saturation, palette.lightness)
}

// 按已等待时长取第几条文案；elapsed 为负或非有限值时退回第一条。
export function phraseAt(list, elapsed) {
  if (!Array.isArray(list) || list.length === 0) return ''
  const safe = Number.isFinite(elapsed) && elapsed > 0 ? elapsed : 0
  return list[Math.floor(safe / ROTATION_MS) % list.length]
}

// 一个字占两列（中日韩文字与全角标点），ASCII 占一列。
export function displayWidth(text) {
  let width = 0
  for (const char of text) {
    const code = char.codePointAt(0)
    width +=
      code >= 0x1100 &&
      (code <= 0x115f ||
        code === 0x2329 ||
        code === 0x232a ||
        (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
        (code >= 0xac00 && code <= 0xd7a3) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0xfe30 && code <= 0xfe6f) ||
        (code >= 0xff00 && code <= 0xff60) ||
        (code >= 0xffe0 && code <= 0xffe6) ||
        (code >= 0x1f300 && code <= 0x1f64f) ||
        (code >= 0x1f900 && code <= 0x1f9ff) ||
        (code >= 0x20000 && code <= 0x3fffd))
        ? 2
        : 1
  }
  return width
}

// 按可用列宽截断文案，超出时以省略号收尾；至少保留一个字符。
export function truncateToWidth(text, maxColumns) {
  if (!Number.isFinite(maxColumns) || maxColumns <= 0) return ''
  if (displayWidth(text) <= maxColumns) return text
  const ellipsis = '…'
  const budget = maxColumns - displayWidth(ellipsis)
  if (budget <= 0) return ellipsis
  let used = 0
  let out = ''
  for (const char of text) {
    const width = displayWidth(char)
    if (used + width > budget) break
    out += char
    used += width
  }
  return out + ellipsis
}

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

export function categoryPhrases(id) {
  if (id === 'all') return ALL_PHRASES
  const found = CATEGORIES.find((entry) => entry.id === id)
  return found ? found.phrases : null
}
