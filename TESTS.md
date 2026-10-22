# 测试记录

运行环境：macOS，Node.js v24.22.0，Claude Code CLI 2.1.306。

## 一、已实际运行的测试

### 1. 配置读写测试（36 项全部通过）

```bash
cd spinner-zh
node tests/run-tests.mjs
```

输出末尾：`通过 36 项，失败 0 项。`

覆盖范围：

| 组 | 用例 |
| --- | --- |
| 资源 | 分类数正确；每个分类文件非空且条数匹配；分类并集等于 `all.json`；无占位符/控制字符且均以省略号结尾；声明上游来源与 MIT |
| 首次启用 | 无 `settings.json` 时创建并写入；备份记录「原本没有该键」；保留其他字段与键顺序；保留缩进与结尾换行；verbs 与资源逐条一致且去重；`all` 分类条数正确 |
| 重复启用与切换 | 同分类重复启用不改写文件；切换后最初备份不被覆盖；切换后 restore 仍还原最初原值；未启用时 `category` 拒绝写入 |
| 冲突 | 首次启用遇到已有 `spinnerVerbs` 拒绝覆盖；`--adopt` 把现值记为原值且 restore 可还原；启用后外部改动导致 `category` 被拒；外部改动后 `restore` 需 `--force`；`--force` 可覆盖并还原；备份缺失时拒绝写入 |
| 恢复 | 删除原本不存在的键；保留启用后用户修改的其他字段；restore 后再启用沿用最初备份；已恢复状态重复 restore 不改文件 |
| 状态与错误 | `status --json` 字段完整；未启用时状态输出正确；非法 JSON 拒绝改动；未知分类/命令列出可用项；`list --json` 内容正确；符号链接写到目标；单行 JSON 保持单行；默认状态目录位置；无临时文件残留；备份与状态文件权限 600 |
| 边界 | 测试前后比对 `~/.claude/settings.json` 的 SHA-256 与修改时间，结果一致 |

所有用例的 settings 与状态目录都在 `mkdtemp()` 创建的临时目录内，测试结束即删除。

### 2. 插件清单校验

```bash
claude plugin validate --strict ./plugins/spinner-zh     # ✔ Validation passed
claude plugin validate --strict ./plugins/spinner-zh/skills  # ✔ Validation passed
claude plugin validate .                                  # marketplace：✔ Validation passed
```

`--strict` 下唯一提示是缺少图标（`ICON_MISSING`）——本地安装不要求图标，未添加。

### 3. 安装、组件清单与卸载（隔离 HOME，已验证）

在 `HOME` 与 `CLAUDE_CONFIG_DIR` 都指向临时目录的前提下执行：

```bash
claude plugin marketplace add ./spinner-zh
claude plugin install spinner-zh@spinner-zh-marketplace
claude plugin list
claude plugin details spinner-zh
claude plugin uninstall spinner-zh@spinner-zh-marketplace
claude plugin marketplace remove spinner-zh-marketplace
```

实际结果：

- 安装输出 `✔ Successfully installed plugin: spinner-zh@spinner-zh-marketplace (scope: user)`。
- `claude plugin details spinner-zh` 的组件清单为 `Skills (4)  category, enable, restore, status`，外加常驻约 83 token 的估算。
- 安装后 `settings.json` 中只出现 `extraKnownMarketplaces` 与 `enabledPlugins` 两个键，没有 `spinnerVerbs`，即安装本身不改写等待文案配置。
- 卸载与移除 marketplace 均成功，临时目录删除后无残留。

### 4. 命令脚本按技能写法执行

以 `CLAUDE_PLUGIN_ROOT` 指向插件目录、`SPINNER_ZH_SETTINGS` 指向临时设置文件的方式，直接运行技能里写明的命令：

```bash
"$CLAUDE_PLUGIN_ROOT/scripts/spinner-zh.mjs" enable daily
"$CLAUDE_PLUGIN_ROOT/scripts/spinner-zh.mjs" status
"$CLAUDE_PLUGIN_ROOT/scripts/spinner-zh.mjs" category coding
"$CLAUDE_PLUGIN_ROOT/scripts/spinner-zh.mjs" restore
```

`enable`、`status`、`category`、`restore` 输出符合预期，`restore` 后设置文件恢复到启用前的两个键，未残留 `spinnerVerbs`。

## 二、未做真实 Claude Code 会话验证的部分

以下项目**没有**在真实登录的 Claude Code 会话里跑通，只完成了静态校验与脚本级验证：

1. **斜杠命令的实际调用**：`claude -p "/spinner-zh:enable daily"` 在隔离 HOME 下返回 `Not logged in · Please run /login`，无法在未登录状态下完成一次真实会话内的命令执行。因此「技能被正确加载并按 SKILL.md 指示执行脚本」这一点，依据的是 `claude plugin details` 的 `Skills (4)` 清单、`claude plugin validate --strict` 的校验结果，以及上面第 4 项直接执行同一命令行文本的结果；未观察真实会话中的模型调用过程。
2. **等待文案的界面效果**：未在真实终端里观察 spinner 是否显示中文文案、是否每轮换一句。相关描述来自对本机 2.1.306 二进制的只读分析：`spinnerVerbs` 在取词处被读取，取词为随机一条，没有为 spinner 动词设置定时器，渲染时对已以 `…`/`...` 结尾的文案不再追加省略号。
3. **`allowed-tools` 免确认**：未验证 `${CLAUDE_PLUGIN_ROOT}` 替换后的规则是否确实免去一次权限询问。

## 三、真实配置未被触碰的证据

- 全部配置读写测试使用临时目录，测试内比对 `~/.claude/settings.json` 的 SHA-256 与修改时间，前后一致。
- 插件安装/卸载验证使用临时 `HOME` 与临时 `CLAUDE_CONFIG_DIR`，结束后已删除。验证前后真实 `~/.claude/plugins/installed_plugins.json`、`known_marketplaces.json` 中均无 `spinner-zh` 记录。
- 真实 `~/.claude/settings.json` 中没有 `spinnerVerbs` 键，修改时间保持为测试前的时间（2026-10-21 14:40:05）。
- 未执行 `git push`，未发布到任何 marketplace 或包仓库。

## 四、OpenAI Codex 兼容性核查

详细结论见 [`CODEX.md`](./CODEX.md)。核查方式与结果：

| 核查方式 | 结果 |
| --- | --- |
| 读取官方配置参考 `tui.*` 全表 | 无任何接受自定义文案的键 |
| 阅读 `StatusLineItem` / `TerminalTitleItem` 枚举与解析代码 | 封闭枚举，无法解析的标识符被静默跳过 |
| 阅读 `status_indicator_widget.rs`、`status_state.rs` | header 默认值 `"Working"` 硬编码，不读配置 |
| `strings` 提取本机二进制 | 110 个 `CODEX_*` 环境变量中无文案覆盖项；配置键簇中无 spinner/verb 相关键 |
| 临时 `CODEX_HOME` 内写入未知顶层表并运行 `codex doctor` | 报告 `config loaded`，静默接受且无效果 |
| 同一临时目录内把 `tui.status_line` 写成非数组 | 明确报 `config could not be loaded` |
| 查阅 hooks 文档的 `statusMessage` | 仅在 hook 执行期间显示，需静态字符串，不能替换主等待指示器 |
| 查阅 issue #11856、#17827 | 仅有动画总开关；自定义状态行格式的请求仍为 Open |

结论：Codex 侧无法实现文案轮换，未对 Codex 做任何配置写入。核查全程使用临时 `CODEX_HOME`，真实 `~/.codex/config.toml` 的 SHA-256（`ce905a69…`）与修改时间（2026-10-21 09:06:30）均未变化。

### 本轮额外核实的检索方式说明

本轮核查使用 `firecrawl` CLI（`firecrawl search`、`firecrawl scrape`）获取官方文档与源码。先前一次 `web_search` 调用因 60 秒上限超时被中止，随后一次虽返回结果但只有来源链接、没有正文，无法支撑结论，因此未采用其内容。

## 五、spinner-zh-mods（彩色轮播版）

运行方式：

```bash
cd plugins/spinner-zh-mods
claude plugin test
```

结果：**18 项全部通过**，无需登录、不消耗额度。

| 组 | 用例 |
| --- | --- |
| 轮播 | 每 4000 毫秒切换一条；按分类内顺序循环；越界与负值退回第一条；空列表返回空串 |
| 彩流 | 同一位置颜色随时间改变；同帧内相邻字符颜色互不相同；色相 0–359 度均为合法六位十六进制；360 度等同 0 度；负角度取模 |
| 分段 | 字符数不超上限时一段一字符；长文案按段合并且拼回原文；空输入返回空数组 |
| 绘制 | 启用后彩色文案与引擎绘制同时出现；停用后不出现彩色文案；颜色为 `#rrggbb` |
| 命令 | 五个命令全部注册；启用带分类参数；未知分类被拒；切换分类写回 store；不带参数列出分类；列表与状态输出内容 |
| 持久化 | 分类与启用状态写入 store；下次启动恢复；状态命令在存在 `spinnerVerbs` 时给出提示 |
| 定时器 | 会话结束取消；空闲期不请求重绘；等待期按帧请求重绘；等待结束后停止 |

`claude plugin validate --strict` 对 `plugins/spinner-zh-mods` 与 marketplace 均返回 `✔ Validation passed`；校验器识别到 10 个钩子（`session.start`、`turn.start`、`turn.complete`、`session.end`、`ui.render{component=Spinner}`、5 个 `command.run`），并列出 8 个 mods API 调用。

### 未做真实会话验证的部分

以下项目没有在真实 Claude Code 会话里观察，依据的是 mods 测试工具链与静态校验：

1. **终端中的实际观感**：颜色在深浅主题下的可读性、流动速度是否舒适、长文案在窄终端是否换行，均未在真实终端里看过。
2. **与引擎 spinner 的并排布局**：测试只验证了树结构合法（彩色段与引擎段都在），未验证实际渲染后两者的间距与对齐。
3. **重绘节流的实际表现**：帧间隔取 100ms 是按文档的通用上限（每秒 10 次）设定的；终端对可见区域的上限是每秒 30 次，但实际帧率未测。
4. **`/reload-plugins` 后的热加载行为**：未验证。
