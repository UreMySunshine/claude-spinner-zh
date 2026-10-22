import { expect, test, mock } from 'claude-code/testing'
import { colorAt, hueToHex, phraseAt, segmentsOf, truncateToWidth, displayWidth, contrastRatio, MAX_SEGMENTS, ROTATION_MS, TICK_MS } from '../hooks/gradient.js'
import { CATEGORIES, ALL_PHRASES } from '../hooks/phrases.js'

const SPINNER = {
  plugin: 'spinner-zh-mods',
  component: 'Spinner',
  requestId: 'main',
  surface: 'terminal',
  viewport: { columns: 120, rows: 30 },
  props: { word: 'Thinking', message: null, suffix: '…', mode: 'responding' },
}

const PANE = {
  plugin: 'spinner-zh-mods',
  component: 'Pane',
  requestId: 'spinner-zh-config',
  surface: 'terminal',
  viewport: { columns: 120, rows: 40 },
  props: {
    title: '等待文案配置',
    isFocused: true,
    bodyColumns: 100,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
}

function stubStorage(on, initial = {}) {
  const saved = new Map(Object.entries(initial))
  on('store.get', ($, e) => ({ value: saved.get(e.key) }))
  on('store.set', ($, e) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  return saved
}

function stubCommon(on) {
  const registered = []
  on('command.register', ($, e) => {
    registered.push(e.name)
    return { value: undefined }
  })
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine'] }))
  on('settings.read', () => ({ value: {} }))
  on('session.start', () => ({ cwd: '/work' }))
  on('turn.start', () => ({ turnId: 't1' }))
  on('turn.complete', () => ({ text: '' }))
  on('session.end', () => ({ sessionId: 'abc' }))
  return registered
}

// 按一次按钮后重新挂载，读取最新的按钮标签（模拟重绘后重新绘制）。
async function labelAfterPress($, key, pressKey) {
  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: pressKey })
  await ui.unmount()
  ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const button = await ui.find({ key })
  const label = button && button.props.label
  await ui.unmount()
  return label
}

async function boot($, on, initial = {}) {
  const clock = mock.clock(on)
  const saved = stubStorage(on, initial)
  const registered = stubCommon(on)
  await $.session.start({ source: 'startup', cwd: '/work' })
  await $.turn.start({ turnId: 't1' })
  return { clock, saved, registered }
}

test('文案每 4 秒切换并循环', async () => {
  const list = ['一', '二', '三']
  expect(phraseAt(list, 0)).toBe('一')
  expect(phraseAt(list, ROTATION_MS - 1)).toBe('一')
  expect(phraseAt(list, ROTATION_MS)).toBe('二')
  expect(phraseAt(list, ROTATION_MS * 3)).toBe('一')
  expect(phraseAt([], 100)).toBe('')
  expect(phraseAt(undefined, 100)).toBe('')
})

test('色相随时间前移，同一位置颜色改变', async () => {
  const a = colorAt(0, 10, 0, false)
  const b = colorAt(0, 10, 300, false)
  expect(a).toMatch(/^#[0-9a-f]{6}$/)
  expect(b).toMatch(/^#[0-9a-f]{6}$/)
  expect(a).not.toBe(b)
})

test('同一帧内相邻字符颜色不同', async () => {
  const colors = []
  for (let index = 0; index < 10; index += 1) colors.push(colorAt(index, 10, 1000, false))
  expect(new Set(colors).size).toBe(10)
})

test('色相换算覆盖 0 到 359 度且总为合法六位十六进制', async () => {
  for (let hue = 0; hue < 360; hue += 7) expect(hueToHex(hue)).toMatch(/^#[0-9a-f]{6}$/)
  expect(hueToHex(360)).toBe(hueToHex(0))
  expect(hueToHex(-60)).toBe(hueToHex(300))
})

test('浅色背景配色对白底对比度高于深色配色', async () => {
  const white = '#ffffff'
  let lightTotal = 0
  let darkTotal = 0
  for (let index = 0; index < 10; index += 1) {
    lightTotal += contrastRatio(colorAt(index, 10, 0, true), white)
    darkTotal += contrastRatio(colorAt(index, 10, 0, false), white)
  }
  expect(lightTotal).toBeGreaterThan(darkTotal)
  const lightMin = Math.min(...Array.from({ length: 10 }, (_, index) => contrastRatio(colorAt(index, 10, 0, true), white)))
  expect(lightMin).toBeGreaterThan(3)
})

test('背景深浅切换会改变同一位置的颜色', async () => {
  expect(colorAt(0, 10, 500, true)).not.toBe(colorAt(0, 10, 500, false))
})

test('显示宽度按中日韩两列计算', async () => {
  expect(displayWidth('ab')).toBe(2)
  expect(displayWidth('中文')).toBe(4)
  expect(displayWidth('中a')).toBe(3)
})

test('按列宽截断并补省略号', async () => {
  expect(truncateToWidth('短句', 20)).toBe('短句')
  const cut = truncateToWidth('一二三四五六七八九十', 10)
  expect(displayWidth(cut)).toBeLessThanOrEqual(10)
  expect(cut.endsWith('…')).toBe(true)
  expect(truncateToWidth('任意', 0)).toBe('')
})

test('分段着色段数受控且能拼回原文', async () => {
  const short = segmentsOf(Array.from('短句'))
  expect(short).toEqual([{ text: '短' }, { text: '句' }])
  const long = segmentsOf(Array.from('一'.repeat(56)))
  expect(long.length).toBeLessThanOrEqual(MAX_SEGMENTS)
  expect(long.map((segment) => segment.text).join('')).toBe('一'.repeat(56))
  expect(segmentsOf([])).toEqual([])
})

test('只注册一条命令', async ($, on) => {
  const { registered } = await boot($, on, {})
  expect(registered).toEqual(['spinner-zh'])
})

test('默认全部分类开启', async ($, on) => {
  await boot($, on, {})
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const labels = []
  for (const entry of CATEGORIES) {
    const button = await ui.find({ key: 'toggle-' + entry.id })
    labels.push(button && button.props.label)
  }
  expect(labels.every((label) => label === '[x]')).toBe(true)
  await ui.unmount()
})

test('点击分类开关会关闭并写回 store', async ($, on) => {
  const { saved } = await boot($, on, {})
  expect(await labelAfterPress($, 'toggle-coding', 'toggle-coding')).toBe('[ ]')
  const stored = saved.get('selected')
  expect(Array.isArray(stored)).toBe(true)
  expect(stored.includes('coding')).toBe(false)
  expect(await labelAfterPress($, 'toggle-coding', 'toggle-coding')).toBe('[x]')
})

test('全选与全不选', async ($, on) => {
  await boot($, on, {})
  expect(await labelAfterPress($, 'toggle-deepseek', 'select-none')).toBe('[ ]')
  expect(await labelAfterPress($, 'toggle-deepseek', 'select-all')).toBe('[x]')
})

test('启用开关与背景开关', async ($, on) => {
  const { saved } = await boot($, on, {})
  expect(await labelAfterPress($, 'toggle-enabled', 'toggle-enabled')).toBe('[ ] 启用')
  expect(saved.get('enabled')).toBe(false)
  expect(await labelAfterPress($, 'toggle-background', 'toggle-background')).toContain('[x]')
  expect(saved.get('lightBackground')).toBe(true)
})

test('命令打开配置面板', async ($, on) => {
  await boot($, on, {})
  const answer = await $.command.run({ command: 'spinner-zh', args: '' })
  expect(answer).toEqual({})
})

test('启用时 spinner 显示彩色文案并保留引擎', async ($, on) => {
  const { clock } = await boot($, on, {})
  const ui = await $.ui.mount({ ...SPINNER, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()
  const colored = await ui.find({ type: 'Text', text: /^[\s\S]$/ })
  expect(colored.props.color).toMatch(/^#[0-9a-f]{6}$/)
  await clock.advance(TICK_MS)
  await ui.unmount()
})

test('停用后不画彩色文案', async ($, on) => {
  await boot($, on, { enabled: false })
  const ui = await $.ui.mount({ ...SPINNER, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^[\s\S]$/ })).toBeUndefined()
  await ui.unmount()
})

test('保存的分类在下次启动时恢复', async ($, on) => {
  const clock = mock.clock(on)
  stubStorage(on, { enabled: true, selected: ['daily', 'coding'], lightBackground: true })
  stubCommon(on)
  await $.session.start({ source: 'startup', cwd: '/work' })
  await $.turn.start({ turnId: 't1' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ key: 'toggle-coding' })).props.label).toBe('[x]')
  expect((await ui.find({ key: 'toggle-deepseek' })).props.label).toBe('[ ]')
  await clock.advance(TICK_MS)
  await ui.unmount()
})

test('定时器只在等待期间运行', async ($, on) => {
  const clock = mock.clock(on)
  stubStorage(on, {})
  let invalidations = 0
  const registered = []
  on('command.register', ($, e) => {
    registered.push(e.name)
    return { value: undefined }
  })
  on('ui.invalidate', () => {
    invalidations += 1
    return { value: undefined }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine'] }))
  on('settings.read', () => ({ value: {} }))
  on('session.start', () => ({ cwd: '/work' }))
  on('turn.start', () => ({ turnId: 't1' }))
  on('turn.complete', () => ({ text: '' }))
  on('session.end', () => ({ sessionId: 'abc' }))
  await $.session.start({ source: 'startup', cwd: '/work' })
  await clock.advance(TICK_MS * 5)
  expect(invalidations).toBe(0)

  await $.turn.start({ turnId: 't1' })
  await clock.advance(TICK_MS * 5)
  expect(invalidations).toBeGreaterThan(0)

  const during = invalidations
  await $.turn.complete({ turnId: 't1', answer: 'x', durationMs: 1, isAborted: false, usage: null })
  await clock.advance(TICK_MS * 5)
  expect(invalidations).toBe(during)
})

test('会话结束时结束回调正常', async ($, on) => {
  mock.clock(on)
  stubStorage(on, {})
  stubCommon(on)
  await $.session.start({ source: 'startup', cwd: '/work' })
  await $.turn.start({ turnId: 't1' })
  expect((await $.session.end({ reason: 'other' })).sessionId).toBe('abc')
})

test('文案资源覆盖 14 个分类与 689 条', async () => {
  expect(CATEGORIES.length).toBe(14)
  expect(ALL_PHRASES.length).toBe(689)
})
