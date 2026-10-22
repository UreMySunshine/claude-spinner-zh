// spinner-zh mods：轮播 + 彩色流动文字的等待文案。
//
// 设计约束（来自 mods 文档与本机实测）：
// - ui.render 的重绘节流上限为每秒 10 次，动画帧间隔不能小于 100ms；
// - Spinner 的 word 传入空字符串会退回内置随机动词，需用零宽空格占位；
// - mods 没有原生的多选控件，分类开关用 Button 逐项切换实现；
// - mods API 不暴露终端主题，背景深浅由用户在面板里指定。
import { CATEGORIES, ALL_PHRASES } from './phrases.js'
import { colorAt, phraseAt, segmentsOf, truncateToWidth, ROTATION_MS, TICK_MS } from './gradient.js'

const PLACEHOLDER_WORD = '\u200b'
const PANE_ID = 'spinner-zh-config'
const SPINNER_COMMAND = 'spinner-zh'

let enabled = true
// 已勾选的分类集合。默认全选，与 dsh-status-rotator 一致。
let selected = new Set(CATEGORIES.map((entry) => entry.id))
let timer = null
let isWorking = false
let turnStartedAt = 0
let lightBackground = false
let lastPhrase = ''

function selectedPhrases() {
  if (selected.size === 0 || selected.size === CATEGORIES.length) return ALL_PHRASES
  const seen = new Set()
  const merged = []
  for (const entry of CATEGORIES) {
    if (!selected.has(entry.id)) continue
    for (const phrase of entry.phrases) {
      if (seen.has(phrase)) continue
      seen.add(phrase)
      merged.push(phrase)
    }
  }
  return merged.length > 0 ? merged : ALL_PHRASES
}

function startTimer($) {
  if (timer !== null) return
  timer = $.clock.every(TICK_MS, () => {
    if (!enabled) return
    $.ui.invalidate('ui.render')
  })
}

function stopTimer() {
  if (timer === null) return
  timer.cancel()
  timer = null
}

async function persist($) {
  await $.store.set('enabled', enabled)
  await $.store.set('selected', [...selected])
  await $.store.set('lightBackground', lightBackground)
}

function toggleCategory(id) {
  if (selected.has(id)) selected.delete(id)
  else selected.add(id)
}

function summaryLines() {
  const list = selectedPhrases()
  const count = selected.size === CATEGORIES.length ? '全部 ' + CATEGORIES.length + ' 个' : selected.size + ' / ' + CATEGORIES.length + ' 个'
  return [
    '状态：' + (enabled ? '已启用' : '已停用'),
    '分类：' + count + '，共 ' + list.length + ' 条',
    '轮播：' + ROTATION_MS / 1000 + ' 秒/条；背景：' + (lightBackground ? '浅色' : '深色'),
  ]
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    const savedEnabled = await $.store.get('enabled')
    const savedSelected = await $.store.get('selected')
    const savedLight = await $.store.get('lightBackground')
    if (typeof savedEnabled === 'boolean') enabled = savedEnabled
    if (typeof savedLight === 'boolean') lightBackground = savedLight
    if (Array.isArray(savedSelected)) {
      const valid = savedSelected.filter((id) => CATEGORIES.some((entry) => entry.id === id))
      selected = new Set(valid)
    }
    try {
      await $.command.register({
        name: SPINNER_COMMAND,
        description: '配置彩色轮播等待文案：选择语料集、开关与背景适配',
      })
    } catch (error) {
      // 命令名被占用时跳过注册，已保存的设置仍然生效。
    }
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      isWorking = true
      turnStartedAt = await $.clock.now()
      if (enabled) startTimer($)
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      isWorking = false
      stopTimer()
    }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    stopTimer()
    isWorking = false
    return next(e)
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (!enabled) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const engine = await next({ ...e, props: { ...e.props, word: PLACEHOLDER_WORD, suffix: '' } })
    const now = await $.clock.now()
    const elapsed = isWorking ? Math.max(0, now - turnStartedAt) : 0
    const phrase = phraseAt(selectedPhrases(), elapsed)
    lastPhrase = phrase

    const viewportColumns = e.viewport && Number.isFinite(e.viewport.columns) ? e.viewport.columns : 0
    const budget = viewportColumns > 0 ? Math.max(8, viewportColumns - 4) : 60
    const shown = truncateToWidth(phrase, budget)

    const segments = segmentsOf(Array.from(shown))
    const spans = segments.map((segment, index) =>
      Text({ color: colorAt(index, segments.length, now, lightBackground), children: [segment.text] }),
    )
    return Box({ flexDirection: 'row', children: [...spans, Text({ children: [' '] }), engine] })
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE_ID) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const rows = CATEGORIES.map((entry) => {
      const isOn = selected.has(entry.id)
      return Box({
        flexDirection: 'row',
        columnGap: 2,
        children: [
          Button({
            key: 'toggle-' + entry.id,
            label: isOn ? '[x]' : '[ ]',
            plain: true,
            onPress: () => {
              toggleCategory(entry.id)
              persist($)
              $.ui.invalidate('ui.render')
            },
          }),
          Text({ children: [entry.label + '（' + entry.phrases.length + ' 条）'] }),
        ],
      })
    })
    const actions = Box({
      flexDirection: 'row',
      columnGap: 2,
      children: [
        Button({
          key: 'toggle-enabled',
          label: enabled ? '[x] 启用' : '[ ] 启用',
          plain: true,
          onPress: () => {
            enabled = !enabled
            if (enabled) startTimer($)
            else stopTimer()
            persist($)
            $.ui.invalidate('ui.render')
          },
        }),
        Button({
          key: 'toggle-background',
          label: lightBackground ? '[x] 浅色背景' : '[ ] 浅色背景',
          plain: true,
          onPress: () => {
            lightBackground = !lightBackground
            persist($)
            $.ui.invalidate('ui.render')
          },
        }),
        Button({
          key: 'select-all',
          label: '全选',
          onPress: () => {
            selected = new Set(CATEGORIES.map((entry) => entry.id))
            persist($)
            $.ui.invalidate('ui.render')
          },
        }),
        Button({
          key: 'select-none',
          label: '全不选',
          onPress: () => {
            selected = new Set()
            persist($)
            $.ui.invalidate('ui.render')
          },
        }),
      ],
    })
    return Box({
      flexDirection: 'column',
      children: [
        Text({ weight: 'semibold', children: ['彩色轮播等待文案'] }),
        Text({ dimColor: true, children: ['点分类开关勾选语料集，默认全开。'] }),
        Box({ height: 1, children: [] }),
        ...rows,
        Box({ height: 1, children: [] }),
        actions,
        Box({ height: 1, children: [] }),
        ...summaryLines().map((line) => Text({ dimColor: true, children: [line] })),
      ],
    })
  })

  on('command.run', { command: SPINNER_COMMAND }, async ($) => {
    await $.ui.open({ id: PANE_ID, title: '等待文案配置', focus: true, closeOnEscape: true })
    return {}
  }).catch(async () => ({ text: '打开配置面板失败。' }))
}
