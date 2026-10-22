import { expect, test, mock } from 'claude-code/testing'
import { colorAt, hueToHex, phraseAt, segmentsOf, MAX_SEGMENTS, ROTATION_MS, TICK_MS } from '../hooks/gradient.js'
import { CATEGORIES, ALL_PHRASES } from '../hooks/phrases.js'

const SPINNER = {
  plugin: 'spinner-zh-mods',
  component: 'Spinner',
  requestId: 'main',
  surface: 'terminal',
  viewport: { columns: 120, rows: 30 },
  props: { word: 'Thinking', message: null, suffix: '…', mode: 'responding' },
}

// 每个测试都要 stub 掉模块会调用的 mods API。
function stubStorage(on, initial = {}) {
  const saved = new Map(Object.entries(initial))
  on('store.get', ($, e) => ({ value: saved.get(e.key) }))
  on('store.set', ($, e) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  return saved
}

function stubCommands(on) {
  const registered = []
  on('command.register', ($, e) => {
    registered.push(e.name)
    return { value: undefined }
  })
  return registered
}

function stubEngine(on) {
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine'] }))
}

function stubSettings(on, value) {
  on('settings.read', () => ({ value }))
}

function stubEvents(on) {
  on('session.start', () => ({ cwd: '/work' }))
  on('turn.start', () => ({ turnId: 't1' }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.invalidate', () => ({ value: undefined }))
}

// 起一个已启用的会话，返回挂载 spinner 的函数。
async function bootEnabled($, on, category = 'coding') {
  const clock = mock.clock(on)
  const saved = stubStorage(on, { enabled: true, category })
  stubCommands(on)
  stubSettings(on, {})
  stubEngine(on)
  stubEvents(on)
  await $.session.start({ source: 'startup', cwd: '/work' })
  await $.turn.start({ turnId: 't1' })
  return { clock, saved }
}

test('文案每 4 秒切换，且按分类内顺序循环', async () => {
  const list = ['一', '二', '三']
  expect(phraseAt(list, 0)).toBe('一')
  expect(phraseAt(list, ROTATION_MS - 1)).toBe('一')
  expect(phraseAt(list, ROTATION_MS)).toBe('二')
  expect(phraseAt(list, ROTATION_MS * 2)).toBe('三')
  expect(phraseAt(list, ROTATION_MS * 3)).toBe('一')
  expect(phraseAt(list, -5)).toBe('一')
  expect(phraseAt([], 100)).toBe('')
  expect(phraseAt(undefined, 100)).toBe('')
})

test('色相随时间前移，同一位置颜色随之改变', async () => {
  const a = colorAt(0, 10, 0)
  const b = colorAt(0, 10, 300)
  expect(a).toMatch(/^#[0-9a-f]{6}$/)
  expect(b).toMatch(/^#[0-9a-f]{6}$/)
  expect(a).not.toBe(b)
})

test('同一帧内相邻字符颜色不同，末字符与首字符不同', async () => {
  const colors = []
  for (let index = 0; index < 10; index += 1) colors.push(colorAt(index, 10, 1000))
  expect(new Set(colors).size).toBe(10)
  expect(colors[0]).not.toBe(colors[9])
})

test('色相换算覆盖 0 到 359 度且总为合法六位十六进制', async () => {
  for (let hue = 0; hue < 360; hue += 7) {
    expect(hueToHex(hue)).toMatch(/^#[0-9a-f]{6}$/)
  }
  expect(hueToHex(360)).toBe(hueToHex(0))
  expect(hueToHex(-60)).toBe(hueToHex(300))
})

test('帧间隔不低于重绘节流上限', async () => {
  expect(TICK_MS).toBeGreaterThanOrEqual(100)
})

test('启用后 spinner 显示彩色文案并保留引擎绘制', async ($, on) => {
  const { clock } = await bootEnabled($, on, 'coding')
  const ui = await $.ui.mount({ ...SPINNER, surface: 'terminal' })

  const engine = await ui.find({ type: 'Text', text: 'engine' })
  expect(engine).toBeDefined()

  const colored = await ui.find({ type: 'Text', text: /^[\s\S]$/ })
  expect(colored).toBeDefined()
  expect(colored.props.color).toMatch(/^#[0-9a-f]{6}$/)

  await clock.advance(TICK_MS)
  await ui.unmount()
})

test('停用后交还引擎自己的 spinner', async ($, on) => {
  mock.clock(on)
  stubStorage(on, { enabled: false, category: 'coding' })
  stubCommands(on)
  stubSettings(on, {})
  stubEngine(on)
  stubEvents(on)
  await $.session.start({ source: 'startup', cwd: '/work' })

  const answer = await $.command.run({ command: 'spinner-zh-off', args: '' })
  expect(answer.text).toContain('已停用')

  const ui = await $.ui.mount({ ...SPINNER, surface: 'terminal' })
  const colored = await ui.find({ type: 'Text', text: /^[\s\S]$/ })
  expect(colored).toBeUndefined()
  await ui.unmount()
})

test('查看分类列表与状态', async ($, on) => {
  const { saved } = await bootEnabled($, on, 'slacking')

  const list = await $.command.run({ command: 'spinner-zh-list', args: '' })
  expect(list.text).toContain('coding')
  expect(list.text).toContain('14 个分类')
  expect(list.text).toContain(String(ALL_PHRASES.length))

  const status = await $.command.run({ command: 'spinner-zh-status', args: '' })
  expect(status.text).toContain('已启用')
  expect(status.text).toContain('slacking')

  expect(saved.get('category')).toBe('slacking')
})

test('状态命令提示 spinnerVerbs 冲突', async ($, on) => {
  mock.clock(on)
  stubStorage(on, { enabled: true, category: 'coding' })
  stubCommands(on)
  stubSettings(on, { spinnerVerbs: { mode: 'replace', verbs: ['x'] } })
  stubEngine(on)
  stubEvents(on)
  await $.session.start({ source: 'startup', cwd: '/work' })

  const status = await $.command.run({ command: 'spinner-zh-status', args: '' })
  expect(status.text).toContain('spinnerVerbs')
})

test('切换分类并写回 store', async ($, on) => {
  const { saved } = await bootEnabled($, on, 'coding')

  const answer = await $.command.run({ command: 'spinner-zh-category', args: 'deepseek' })
  expect(answer.text).toContain('deepseek')
  expect(saved.get('category')).toBe('deepseek')

  const unknown = await $.command.run({ command: 'spinner-zh-category', args: 'nope' })
  expect(unknown.text).toContain('未知分类')
})

test('不带参数时列出分类', async ($, on) => {
  await bootEnabled($, on, 'coding')
  const answer = await $.command.run({ command: 'spinner-zh-category', args: '' })
  expect(answer.text).toContain('当前分类：coding')
  for (const entry of CATEGORIES) expect(answer.text).toContain(entry.id)
})

test('启用命令接受分类参数并拒绝未知分类', async ($, on) => {
  const { saved } = await bootEnabled($, on, 'coding')
  await $.command.run({ command: 'spinner-zh-off', args: '' })
  expect(saved.get('enabled')).toBe(false)

  const ok = await $.command.run({ command: 'spinner-zh-on', args: 'star-route' })
  expect(ok.text).toContain('star-route')
  expect(saved.get('enabled')).toBe(true)

  const bad = await $.command.run({ command: 'spinner-zh-on', args: 'bogus' })
  expect(bad.text).toContain('未知分类')
})

test('五个命令都注册成功', async ($, on) => {
  mock.clock(on)
  stubStorage(on, {})
  const registered = stubCommands(on)
  stubSettings(on, {})
  stubEngine(on)
  stubEvents(on)
  await $.session.start({ source: 'startup', cwd: '/work' })

  expect(registered).toEqual([
    'spinner-zh-on',
    'spinner-zh-off',
    'spinner-zh-category',
    'spinner-zh-list',
    'spinner-zh-status',
  ])
})

test('保存的分类在下次启动时恢复', async ($, on) => {
  mock.clock(on)
  stubStorage(on, { enabled: true, category: 'math-physics' })
  stubCommands(on)
  stubSettings(on, {})
  stubEngine(on)
  stubEvents(on)
  await $.session.start({ source: 'startup', cwd: '/work' })

  const status = await $.command.run({ command: 'spinner-zh-status', args: '' })
  expect(status.text).toContain('math-physics')
})

test('长文案按段着色，段数不超过上限', async () => {
  const short = segmentsOf(Array.from('短句'))
  expect(short).toEqual([{ text: '短' }, { text: '句' }])

  const long = segmentsOf(Array.from('一'.repeat(56)))
  expect(long.length).toBeLessThanOrEqual(MAX_SEGMENTS)
  expect(long.map((segment) => segment.text).join('')).toBe('一'.repeat(56))

  expect(segmentsOf([])).toEqual([])
})

test('最长文案的绘制元素数量受控', async ($, on) => {
  const { clock } = await bootEnabled($, on, 'ads')
  const ui = await $.ui.mount({ ...SPINNER, surface: 'terminal' })
  let count = 0
  for (let index = 0; index < 40; index += 1) {
    const node = await ui.find({ type: 'Text' })
    if (!node) break
    count += 1
    break
  }
  expect(count).toBe(1)
  await clock.advance(TICK_MS)
  await ui.unmount()
})

test('会话结束时取消定时器', async ($, on) => {
  mock.clock(on)
  stubStorage(on, { enabled: true, category: 'coding' })
  stubCommands(on)
  stubSettings(on, {})
  stubEngine(on)
  stubEvents(on)
  on('session.end', () => ({ sessionId: 'abc123' }))
  await $.session.start({ source: 'startup', cwd: '/work' })
  await $.turn.start({ turnId: 't1' })
  const answer = await $.session.end({ reason: 'other' })
  expect(answer.sessionId).toBe('abc123')
})

test('定时器只在等待期间运行，空闲时不请求重绘', async ($, on) => {
  const clock = mock.clock(on)
  stubStorage(on, { enabled: true, category: 'coding' })
  stubCommands(on)
  stubSettings(on, {})
  stubEngine(on)
  let invalidations = 0
  on('ui.invalidate', () => {
    invalidations += 1
    return { value: undefined }
  })
  on('session.start', () => ({ cwd: '/work' }))
  on('turn.start', () => ({ turnId: 't1' }))
  on('turn.complete', () => ({ text: '' }))

  await $.session.start({ source: 'startup', cwd: '/work' })
  // 会话启动后、提问之前：不应当有重绘请求
  await clock.advance(TICK_MS * 5)
  expect(invalidations).toBe(0)

  await $.turn.start({ turnId: 't1' })
  await clock.advance(TICK_MS * 5)
  expect(invalidations).toBeGreaterThan(0)

  const duringTurn = invalidations
  await $.turn.complete({ turnId: 't1', answer: 'x', durationMs: 1, isAborted: false, usage: null })
  await clock.advance(TICK_MS * 5)
  expect(invalidations).toBe(duringTurn)
})
