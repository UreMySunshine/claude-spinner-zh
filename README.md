# spinner-zh

把 Claude Code 等待时的 spinner 换成分类中文文案。仓库提供两个插件，按需要选一个：

| 插件 | 机制 | 轮播 | 彩色流动 |
| --- | --- | --- | --- |
| [`spinner-zh-mods`](plugins/spinner-zh-mods/README.md) | mods，在渲染时重绘 spinner | 支持，同一轮等待中每 4 秒换一句 | 支持，按段着色并随时间流动，明暗两套配色 |
| `spinner-zh` | 原生 `spinnerVerbs` 设置项 | 不支持单轮内切换 | 不支持 |

两者都不修改二进制、不注入终端、不启动常驻进程、不联网、不调用模型。

## 安装

```bash
claude plugin marketplace add UreMySunshine/claude-spinner-zh

# 彩色轮播版（推荐）
claude plugin install spinner-zh-mods@spinner-zh-marketplace

# 或：原生 spinnerVerbs 版
claude plugin install spinner-zh@spinner-zh-marketplace
```

`spinner-zh-mods` 需要 Claude Code v2.1.287 或更高版本。装好后重启，或在会话里执行 `/reload-plugins`。

以下各节说明 `spinner-zh`（原生 `spinnerVerbs` 版）的实现细节；`spinner-zh-mods` 的说明在 [`plugins/spinner-zh-mods/README.md`](plugins/spinner-zh-mods/README.md)。

## 1. 它做的事

- 把选定分类的中文文案写入 `settings.json` 的 `spinnerVerbs`，`mode` 固定为 `replace`。
- 只写这一个键，其余字段、键顺序、缩进、单行/多行风格保持原样。
- 首次启用前备份原值；重复启用不覆盖最初备份；恢复时只还原 `spinnerVerbs`。
- 检测到 `spinnerVerbs` 与本插件记录不一致时报告冲突，不覆盖。

## 2. 原生机制与实际轮换行为

`spinnerVerbs` 是 Claude Code 的官方设置项（[Settings reference](https://code.claude.com/docs/en/settings-reference#spinnerverbs)），类型为 `{ "mode": "append" | "replace", "verbs": string[] }`：

- `append`：把自定义动词加入内置列表。
- `replace`：只显示自定义动词；`verbs` 为空数组时仍用内置列表。

按当前 Claude Code（本机验证版本 2.1.306）的实际行为：

1. 等待文案是 `verbs` 数组里的**随机一条**，在 spinner 状态建立或重置时选出，整轮等待保持不变。该版本没有为 spinner 动词设置定时器，`spinnerVerbs` 只在取词处被读取。
2. 同一次等待过程中不会更换文案；切换分类后，新文案从**下一次等待**开始出现。
3. 因此本插件不提供「定时轮播」，也不把随机取一句说成轮播。要让每次等待换一句，靠的是 `verbs` 有多条加上每轮重新取词——本插件每个分类都远多于一条。
4. 界面上文案后面的 `…` 由 Claude Code 追加；当文案本身已以 `…` 或 `...` 结尾时它不再追加，所以不会出现两个省略号。

## 3. 文案数量与分类

中文文案共 **689 条**（跨分类去重后），分为 **14 个分类**：

| 分类 ID | 名称 | 条数 |
| --- | --- | ---: |
| `reverse-proxy` | 反代 | 18 |
| `deepseek` | DeepSeek 专场 | 104 |
| `western-ai` | 西方 AI 圈 | 20 |
| `china-ai` | 中国 AI 圈 | 22 |
| `coding` | 写代码日常 | 86 |
| `sysadmin` | 系统管理 | 35 |
| `math-physics` | 数学与物理 | 33 |
| `slacking` | 摸鱼 | 39 |
| `internet-memes` | 网络梗 | 57 |
| `daily` | 日常 | 75 |
| `community` | 社区投稿 | 25 |
| `ads` | 广告 | 3 |
| `star-ask` | 求 star | 11 |
| `star-route` | 星标者路由 | 161 |
| `all` | 全部分类（去重合并） | 689 |

上游共 746 条中文条目，本插件排除 17 条含 `{占位符}` 的条目、合并 40 条分类内重复条目，其余文字未改动。来源、提交号与许可见[来源与许可](#7-来源与许可)。

## 4. 安装

需要 Node.js（脚本只用内置模块，无需 `npm install`）。已在 macOS 上用 Node 24.22.0 验证。

从 GitHub 安装（仓库根目录即 marketplace 根目录）：

```bash
claude plugin marketplace add UreMySunshine/claude-spinner-zh
claude plugin install spinner-zh@spinner-zh-marketplace
```

从本地克隆安装（`<路径>` 指向克隆后的仓库根目录）：

```bash
claude plugin marketplace add <路径>/spinner-zh
claude plugin install spinner-zh@spinner-zh-marketplace
```

安装只把插件与 marketplace 登记到 Claude Code 自己的插件配置（`settings.json` 的 `extraKnownMarketplaces` 与 `enabledPlugins`），**不会写入 `spinnerVerbs`**；等待文案仍要主动执行 `/spinner-zh:enable` 才会变化。安装后启动新的 Claude Code 会话，或在已有会话执行 `/reload-plugins` 使命令生效。

确认安装：

```bash
claude plugin list
claude plugin details spinner-zh
```

`details` 的组件清单应为 `Skills (4) category, enable, restore, status`。

开发调试时也可以不安装，直接用 `claude --plugin-dir <路径>/spinner-zh` 启动会话。

## 5. 使用

四条命令都在 Claude Code 会话内执行：

| 命令 | 作用 |
| --- | --- |
| `/spinner-zh:enable <分类>` | 启用：首次启用先把原值写入备份，再写 `spinnerVerbs` |
| `/spinner-zh:category <分类>` | 切换分类；未启用时拒绝执行 |
| `/spinner-zh:status` | 查看启用状态、分类、条数、备份内容和一致性检查 |
| `/spinner-zh:restore` | 只把 `spinnerVerbs` 恢复为启用前原值 |

分类参数用第 3 节的分类 ID，另可用 `all`。列出分类也可以直接运行脚本：

```bash
node <路径>/spinner-zh/plugins/spinner-zh/scripts/spinner-zh.mjs list
```

典型流程：

```text
/spinner-zh:enable coding
/spinner-zh:status
/spinner-zh:category daily
/spinner-zh:restore
```

### 冲突处理

以下两种情况插件不会覆盖，而是报告冲突并保持文件不变：

1. `settings.json` 里已有 `spinnerVerbs`（例如由其他插件或手工设置），而本插件从未启用过。确认可以覆盖后，用 `/spinner-zh:enable <分类> --adopt`：当前值会被记为「启用前原值」，之后 `restore` 会还原到它。
2. 启用后 `spinnerVerbs` 被外部改动，与插件记录不一致。`category`、`enable` 会拒绝；`restore` 需显式加 `--force`。

备份文件与状态文件位于 `spinner-zh/` 目录（默认在 `settings.json` 同级的 `spinner-zh/` 子目录）：

- `backup.json`：首次启用前的原值，写一次后不再覆盖。
- `state.json`：当前是否启用、分类、写入条数、写入内容的哈希。

## 6. 停用与卸载

**停用（保留插件、恢复原配置）**：

```text
/spinner-zh:restore
```

只还原 `spinnerVerbs`；你在启用期间对 `settings.json` 其他字段的修改都保留。

**卸载插件**（不自动还原配置，需要先 restore）：

```bash
claude plugin uninstall spinner-zh@spinner-zh-marketplace
claude plugin marketplace remove spinner-zh-marketplace
```

插件本身不改动设置，卸载插件不会移除已写入的 `spinnerVerbs`，所以先执行 `/spinner-zh:restore` 再卸载。备份与状态文件不会自动删除；确认不再需要时可手工删除设置文件同级的 `spinner-zh/` 目录。

## 7. 来源与许可

- 中文文案来自 [01Virex/dsh-status-rotator](https://github.com/01Virex/dsh-status-rotator)（MIT License，Copyright (c) 2026 01Virex），来源提交 `bf980a6`，上游许可证副本见 `plugins/spinner-zh/LICENSE-UPSTREAM-MIT`。
- 改动范围见 `plugins/spinner-zh/NOTICE.md`。
- 本插件代码以 MIT 发布，见 `plugins/spinner-zh/LICENSE`。

## 8. 目录结构

```text
spinner-zh/
├── .claude-plugin/marketplace.json        # 本地 marketplace 清单
├── plugins/spinner-zh/
│   ├── .claude-plugin/plugin.json         # 插件清单
│   ├── skills/{enable,category,status,restore}/SKILL.md
│   ├── scripts/spinner-zh.mjs             # 配置读写脚本
│   ├── phrases/                           # 分类文案与索引
│   ├── README.md  LICENSE  LICENSE-UPSTREAM-MIT  NOTICE.md
├── tools/build-phrases.mjs                # 从上游生成文案资源
├── tests/run-tests.mjs                    # 临时目录内的配置读写测试
├── CODEX.md                               # OpenAI Codex 兼容性核查
└── README.md
```

## 9. 测试与验证情况

详见 [`TESTS.md`](./TESTS.md)。全部配置读写测试在系统临时目录中进行，运行前后比对 `~/.claude/settings.json` 的哈希与修改时间，确认真实配置未被触碰。

## 10. 其他工具（OpenAI Codex）

核查结论：Codex CLI 当前没有可用的原生等待文案配置，本插件无法在 Codex 上提供文案轮换。`tui.status_line` 与 `tui.terminal_title` 只接受封闭枚举里的固定标识符，等待指示器的 `Working`、`Thinking` 硬编码在源码中，配置里写入类似的键会被静默忽略。详见 [`CODEX.md`](./CODEX.md)。
