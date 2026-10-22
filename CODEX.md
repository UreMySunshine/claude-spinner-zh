# Codex 兼容性核查

结论：**当前 Codex CLI 没有可用的原生等待文案配置，本插件的文案轮换功能无法在 Codex 上实现。** 在「不修改二进制、不做终端注入、不启动常驻进程」的约束下，没有合规的兼容路径。

## 一、核查对象

| 项目 | 值 |
| --- | --- |
| Codex CLI 版本 | `0.163.0-alpha.10.2` |
| 安装位置 | `/Applications/ChatGPT.app/Contents/Resources/codex-cli/` |
| 配置目录 | `~/.codex/`，主配置 `config.toml` |
| 配置格式 | TOML |

## 二、逐项核查结果

### 1. 配置项：没有等待文案相关的键

官方配置参考列出的全部 `tui.*` 键如下（节选相关项）：

| 键 | 类型 | 含义 |
| --- | --- | --- |
| `tui.animations` | boolean | 是否启用终端动画（欢迎界面、微光、spinner），默认 true |
| `tui.status_line` | array\<string> \| null | 页脚状态行的**条目标识符**有序列表 |
| `tui.terminal_title` | array\<string> \| null | 终端标题的**条目标识符**有序列表，默认 `["spinner", "project"]` |
| `tui.effects` | table | 各类效果的开关 |

没有任何键接受自定义文案字符串。`tui.animations` 只能整体关闭动画，不能替换文字。

### 2. 状态行与终端标题：只接受固定标识符，不接受自由文本

`StatusLineItem` 是封闭枚举，共 30 个变体（`model`、`current-dir`、`run-state`、`context-used`、`thread-title` 等）。解析方式是：

```rust
let Ok(item) = id.parse::<StatusLineItem>() else {
    continue;
};
```

无法解析的标识符被**静默跳过**。因此往 `tui.status_line` 里写中文文案不会显示任何内容，也不会报错——这是最容易误判的地方。

`tui.terminal_title` 同理，`["spinner", "project"]` 中的 `spinner` 指的是动画帧，不是可替换的文案。

### 3. 等待文案本身：硬编码在源码里

`StatusIndicatorWidget` 的 header 字段注释为 `Animated header text (defaults to "Working")`，默认值：

```rust
header: String::from("Working"),
```

`StatusIndicatorState::working()` 同样写死 `"Working"`。header 的更换由内部状态机驱动（例如切换到 `"Thinking"`、`"Reviewing approval requests"`），不读取任何用户配置。

### 4. 环境变量：没有文案覆盖入口

二进制中 `CODEX_*` 环境变量共 110 个，与界面文字相关的只有 `CODEX_TUI_RECORD_SESSION`、`CODEX_TUI_SESSION_LOG_*`、`CODEX_TUI_DISABLE_KEYBOARD_ENHANCEMENT` 等调试用途，没有 spinner 或 header 文案的覆盖项。

### 5. 功能开关：只有动画开关

`tui.animations = false` 会让所有 TUI 动画（含 spinner）停用，来源是社区 issue [#11856](https://github.com/openai/codex/issues/11856) 中维护者给出的方案。它解决的是「不要动画」，与「换成自己的文案」是两件事。

### 6. 状态行自定义格式：尚未实现

社区 issue [#17827](https://github.com/openai/codex/issues/17827) 请求自定义状态行格式（例如 `format = "{model} | effort:{effort}"`），当前状态为 **Open**，未实现。

### 7. hooks 的 `statusMessage`：范围不匹配

Codex hooks 的每个 handler 支持可选的 `statusMessage`，文档描述为「Optional message shown while the hook runs」。它的显示范围是**该 hook 执行期间**，不是主等待指示器，且是 `config.toml` 里的静态字符串，不随轮次变化。把它当作等待文案的载体，既不能替换 `Working`，也无法做到每轮轮换。

### 8. 未知配置键被静默接受

实测：在 `config.toml` 中写入一个不存在的顶层表（如 `[spinner_verbs]`），`codex doctor` 报告 `config loaded`，不报错、不警告、无任何效果。同一文件里把 `tui.status_line` 写成非数组则会明确报 `config could not be loaded`。

这意味着任何「写一个看起来像配置的键」的做法都会静默失效，用户只会以为插件坏了。本插件不采用这种做法。

## 三、为什么不采用其他路径

| 路径 | 不采用的原因 |
| --- | --- |
| 修改 Codex 二进制 | 违反约束；升级即失效；破坏签名 |
| 终端注入 / 包装 TUI 输出 | 需要解析 ratatui 的重绘流并重写缓冲区，本质是终端注入，且与终端复用、滚动回看冲突 |
| 常驻进程定时改写状态 | Codex 的状态行由进程内状态机直接渲染，外部无法写入；且违反「不启动常驻进程」 |
| 用 hooks 动态改写配置文件 | 需要每轮改写 `config.toml`，而 header 不读配置，改也无效；同时会让配置长期处于被自动改写状态 |

## 四、当前 Codex 上能做的、与文案无关的两件事

如果目的只是「让等待区安静一点」，Codex 自身支持：

```toml
[tui]
animations = false          # 关闭欢迎动画、微光与 spinner 动画
status_line = ["model", "context-used"]   # 精简页脚条目，null 可关闭
```

这两项都不涉及文案，本插件不代为写入，也不宣称它们等同于文案轮换。

## 五、如果 Codex 以后加了原生配置

本插件的文案资源是纯数据（`plugins/spinner-zh/phrases/*.json`，`{ id, label, phrases: string[] }`），与 Claude Code 的 `spinnerVerbs` 结构解耦。一旦 Codex 提供接受字符串数组的官方键，只需在脚本中新增一个写入目标与对应的备份/恢复逻辑，文案资源可直接复用，不需要重新整理。

## 六、核查依据

- 配置项全表与语义：[Config reference](https://learn.chatgpt.com/docs/config-file/config-reference)
- 状态行条目枚举与解析：[status_line_setup.rs](https://github.com/openai/codex/blob/main/codex-rs/tui/src/bottom_pane/status_line_setup.rs)
- 等待指示器渲染与 header 默认值：[status_indicator_widget.rs](https://github.com/openai/codex/blob/main/codex-rs/tui/src/status_indicator_widget.rs)
- 状态机 header 赋值：[status_state.rs](https://github.com/openai/codex/blob/main/codex-rs/tui/src/chatwidget/status_state.rs)
- hooks 的 `statusMessage` 语义：[Hooks](https://learn.chatgpt.com/docs/hooks)
- 动画开关来源：[issue #11856](https://github.com/openai/codex/issues/11856)
- 自定义状态行请求：[issue #17827](https://github.com/openai/codex/issues/17827)
- 本机二进制只读检查：`strings` 提取配置键与源码路径，`codex doctor` 在临时 `CODEX_HOME` 下验证配置解析行为；未修改任何 Codex 文件
