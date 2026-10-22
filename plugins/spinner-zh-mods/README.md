# spinner-zh-mods

把 Claude Code 等待时的 spinner 换成**彩色流动的中文轮播文案**：逐字符着色、色相随时间横向流动、每 4 秒换一句，并保留 Claude Code 原本的等待动画。

这是一个 Claude Code [mod](https://code.claude.com/docs/en/plugins/mods/overview)，钩子在 Claude Code 进程内运行，通过官方 `ui.render` 扩展点重绘 spinner。不修改二进制、不做终端注入、不启动常驻进程、不联网。

## 与 spinner-zh 的区别

| | `spinner-zh` | `spinner-zh-mods`（本插件） |
| --- | --- | --- |
| 机制 | 写入 `settings.json` 的 `spinnerVerbs` | mod 在渲染时替换 spinner 文案 |
| 轮播 | 不支持单轮内切换，每轮随机取一句 | 支持，同一轮等待中每 4 秒换一句 |
| 彩色流动 | 不支持 | 支持，逐段着色并随时间流动 |
| 动配置 | 会写 `settings.json` | 不写任何设置文件，状态存于插件自己的 `$.store` |
| 克隆的 spinner 动画 | 保留 | 保留 |

两个插件可以共存：mod 启用时 `spinnerVerbs` 不会显示；`/spinner-zh-status` 会提示这一点。

## 安装

需要 Claude Code v2.1.287 或更高版本（mods 的最低版本要求）。

```bash
claude plugin marketplace add UreMySunshine/spinner-zh
claude plugin install spinner-zh-mods@spinner-zh-marketplace
```

装好后重启 Claude Code，或在会话里执行 `/reload-plugins`。用 `/plugin` 确认：底部应出现类似 `1 mod active · spinner-zh-mods` 的提示行。

首次加载默认即启用（分类 `coding`，即「写代码日常」）。不需要额外配置。

## 命令

| 命令 | 作用 |
| --- | --- |
| `/spinner-zh-on [分类]` | 启用，可顺带指定分类 |
| `/spinner-zh-off` | 停用，恢复 Claude Code 原本的样子 |
| `/spinner-zh-category [分类]` | 切换分类；不带参数时列出全部分类 |
| `/spinner-zh-list` | 列出 14 个分类与条数 |
| `/spinner-zh-status` | 查看启用状态、分类、轮播参数 |

启用状态与分类存在插件自己的 store 里，下次启动自动恢复。

## 效果参数

| 参数 | 值 | 说明 |
| --- | --- | --- |
| 轮播间隔 | 4000 毫秒 | 每条文案停留时长，从本轮等待开始时算起 |
| 帧间隔 | 100 毫秒 | 等于 Claude Code 对 `ui.render` 的重绘节流上限（每秒 10 次） |
| 色相速度 | 70 度/秒 | 整体相位前移速度，形成横向流动 |
| 色相跨度 | 140 度 | 一行文案内首尾字符的色相差 |
| 饱和度 / 亮度 | 88% / 66% | 在深浅两种终端主题下都保持可读 |
| 每帧最多着色段数 | 24 | 长文案按段合并，避免元素过多 |

终端对可见区域的重绘上限是每秒 30 次；本插件取每秒 10 次，是通用上限，能保证在各种终端下稳定。

## 实现要点

- **轮播**：`turn.start` 记录本轮开始时间，`$.clock.every(100, …)` 每 100 毫秒调用 `$.ui.invalidate('ui.render')` 请求重绘，`ui.render` 里按时长取第 `floor(elapsed / 4000)` 条文案。因此换句发生在同一次等待过程中，而不是等到下一轮。
- **彩色流动**：把文案拆成若干段，每段的色相为 `相位 + 段序 / 段数 × 140°`，相位随时间前移。同一帧内首尾颜色不同，下一帧整体偏移，形成流动。
- **保留原动画**：调用 `next({ ...e, props: { ...e.props, word: '\u200b', suffix: '' } })` 取得引擎自己的 spinner 绘制，再与彩色文案横向并排。`word` 用零宽空格占位，因为传入空字符串会让引擎退回内置随机动词。
- **省略号**：文案本身已以 `…` 结尾，因此把 `suffix` 置空，避免出现两个省略号。
- **清理**：`turn.complete` 与 `session.end` 都会取消定时器，避免遗留重绘请求。

## 文案

14 个分类共 689 条中文文案，取自 [01Virex/dsh-status-rotator](https://github.com/01Virex/dsh-status-rotator)（MIT License，Copyright (c) 2026 01Virex），原许可证副本见 `LICENSE-UPSTREAM-MIT`。

分类：`reverse-proxy`（18）、`deepseek`（104）、`western-ai`（20）、`china-ai`（22）、`coding`（86）、`sysadmin`（35）、`math-physics`（33）、`slacking`（39）、`internet-memes`（57）、`daily`（75）、`community`（25）、`ads`（3）、`star-ask`（11）、`star-route`（161），以及 `all`（689）。

文案以 `hooks/phrases.js` 形式随插件发布，因为它由 `tools/build-mod-phrases.mjs` 从 `plugins/spinner-zh/phrases` 生成，不需要手工编辑。

## 停用与卸载

```text
/spinner-zh-off
```

只停用绘制，插件仍然加载。要彻底移除：

```bash
claude plugin uninstall spinner-zh-mods@spinner-zh-marketplace
```

卸载后 spinner 恢复原样；插件没有改动任何设置文件，因此无需恢复配置。

## 测试

```bash
cd plugins/spinner-zh-mods
claude plugin test
```

17 项测试，覆盖轮播计时、色相换算、分段着色、启用与停用、五个命令、store 持久化、会话结束清理。全部使用 mods 测试工具链，不需要登录、不消耗额度。

## 许可

MIT，见 `LICENSE`；上游文案许可见 `LICENSE-UPSTREAM-MIT`。

## 已知限制

- 重绘上限为每秒 10 次（终端可见区域为每秒 30 次），因此色彩是逐帧跳变，不是连续渐变。
- 逐段着色意味着长文案里相邻字符可能共用一种颜色；这是为控制每帧元素数量而做的取舍。
- 深浅主题下的实际可读性未在真实终端里核对过。
