// spinner-zh mods：轮播 + 彩色流动文字的等待文案。
//
// 设计约束（来自 mods 文档与本机实测）：
// - ui.render 的重绘节流上限为每秒 10 次，动画帧间隔不能小于 100ms；
// - 检测到文案以省略号结尾时引擎不再追加后缀，因此本模块自己控制省略号；
// - Spinner 的 word 传入空字符串会退回内置随机动词，需用零宽空格占位。
import { CATEGORIES, ALL_PHRASES, DEFAULT_CATEGORY } from './phrases.js'
import { colorAt, phraseAt, segmentsOf, ROTATION_MS, TICK_MS, HUE_DEG_PER_SECOND } from './gradient.js'

const PLACEHOLDER_WORD = '\u200b'

let enabled = true
let category = DEFAULT_CATEGORY
let timer = null
let isWorking = false
let turnStartedAt = 0

function phrasesOf(id) {
  if (id === 'all') return ALL_PHRASES
  const found = CATEGORIES.find((entry) => entry.id === id)
  return found ? found.phrases : null
}

function categoryLabel(id) {
  if (id === 'all') return '全部分类'
  const found = CATEGORIES.find((entry) => entry.id === id)
  return found ? found.label : id
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

function describe() {
  const list = phrasesOf(category) ?? ALL_PHRASES
  const lines = [
    '状态：' + (enabled ? '已启用' : '已停用'),
    '分类：' + category + '（' + categoryLabel(category) + '），' + list.length + ' 条',
    '轮播间隔：' + ROTATION_MS / 1000 + ' 秒/条，与 Claude Code 的等待过程同步',
    '彩色流动：按段着色，色相按 ' + HUE_DEG_PER_SECOND + ' 度/秒前移',
    '命令：/spinner-zh-on [分类]、/spinner-zh-off、/spinner-zh-category <分类>、/spinner-zh-list、/spinner-zh-status',
  ]
  return lines.join('\n')
}

async function persist($) {
  await $.store.set('enabled', enabled)
  await $.store.set('category', category)
}

async function registerCommands($) {
  const commands = [
    { name: 'spinner-zh-on', description: '启用彩色轮播等待文案，可带分类参数', argumentHint: '[分类]' },
    { name: 'spinner-zh-off', description: '停用彩色轮播等待文案，恢复 Claude Code 原本的 spinner' },
    { name: 'spinner-zh-category', description: '切换等待文案分类，不带参数时列出可用分类', argumentHint: '[分类]' },
    { name: 'spinner-zh-list', description: '列出全部分类与条数' },
    { name: 'spinner-zh-status', description: '查看当前状态、分类与轮播参数' },
  ]
  for (const command of commands) {
    await $.command.register(command)
  }
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    const savedEnabled = await $.store.get('enabled')
    const savedCategory = await $.store.get('category')
    if (typeof savedEnabled === 'boolean') enabled = savedEnabled
    if (typeof savedCategory === 'string' && phrasesOf(savedCategory)) category = savedCategory
    await registerCommands($)
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
    // 定时器不会随会话结束自动停止，这里显式取消，避免遗留重绘请求。
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
    const phrase = phraseAt(phrasesOf(category) ?? ALL_PHRASES, elapsed)
    const segments = segmentsOf(Array.from(phrase))
    const spans = segments.map((segment, index) =>
      Text({ color: colorAt(index, segments.length, now), children: [segment.text] }),
    )
    return Box({ flexDirection: 'row', children: [...spans, Text({ children: [' '] }), engine] })
  })

  on('command.run', { command: 'spinner-zh-on' }, async ($, e) => {
    const requested = (e.args || '').trim()
    if (requested) {
      if (!phrasesOf(requested)) {
        return { text: '未知分类：' + requested + '\n可用分类：' + CATEGORIES.map((entry) => entry.id).join('、') + '、all' }
      }
      category = requested
    }
    enabled = true
    await persist($)
    startTimer($)
    $.ui.invalidate('ui.render')
    return { text: '已启用彩色轮播等待文案\n' + describe() }
  }).catch(async () => ({ text: '启用失败，已保持原状。' }))

  on('command.run', { command: 'spinner-zh-off' }, async ($) => {
    enabled = false
    stopTimer()
    await persist($)
    $.ui.invalidate('ui.render')
    return { text: '已停用。等待文案恢复为 Claude Code 原本的样子。\n重新启用：/spinner-zh-on' }
  }).catch(async () => ({ text: '停用失败，已保持原状。' }))

  on('command.run', { command: 'spinner-zh-category' }, async ($, e) => {
    const requested = (e.args || '').trim()
    if (!requested) {
      const lines = ['当前分类：' + category + '（' + categoryLabel(category) + '）', '', '可用分类：']
      for (const entry of CATEGORIES) {
        lines.push('  ' + entry.id.padEnd(16) + entry.phrases.length + ' 条  ' + entry.label)
      }
      lines.push('  ' + 'all'.padEnd(16) + ALL_PHRASES.length + ' 条  全部分类')
      lines.push('', '切换：/spinner-zh-category <分类>')
      return { text: lines.join('\n') }
    }
    if (!phrasesOf(requested)) {
      return { text: '未知分类：' + requested + '\n可用分类：' + CATEGORIES.map((entry) => entry.id).join('、') + '、all' }
    }
    category = requested
    enabled = true
    await persist($)
    startTimer($)
    $.ui.invalidate('ui.render')
    return { text: '已切换到：' + category + '（' + categoryLabel(category) + '），' + (phrasesOf(category) ?? []).length + ' 条' }
  }).catch(async () => ({ text: '切换分类失败，已保持原状。' }))

  on('command.run', { command: 'spinner-zh-list' }, async () => {
    const lines = ['分类 ID          条数  名称']
    for (const entry of CATEGORIES) {
      lines.push(entry.id.padEnd(16) + String(entry.phrases.length).padStart(4) + '  ' + entry.label)
    }
    lines.push('all'.padEnd(16) + String(ALL_PHRASES.length).padStart(4) + '  全部分类')
    lines.push('', '共 ' + CATEGORIES.length + ' 个分类；全部分类去重后 ' + ALL_PHRASES.length + ' 条。')
    return { text: lines.join('\n') }
  }).catch(async () => ({ text: '读取分类失败。' }))

  on('command.run', { command: 'spinner-zh-status' }, async ($) => {
    const settingsFile = await $.settings.read()
    const keys = settingsFile && typeof settingsFile === 'object' ? Object.keys(settingsFile) : []
    const lines = [describe()]
    if (keys.includes('spinnerVerbs')) {
      lines.push('', '注意：settings.json 里存在 spinnerVerbs。本模块在渲染时替换文案，因此 spinnerVerbs 不会显示；如需避免两套配置并存，可执行 /spinner-zh:restore 清掉它。')
    }
    return { text: lines.join('\n') }
  }).catch(async () => ({ text: '读取状态失败。' }))
}
