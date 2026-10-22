# spinner-zh

把 Claude Code 等待中的英文 spinner 动词换成分类中文文案。只读写 `settings.json` 里的原生 `spinnerVerbs` 键，不修改 Claude Code 二进制，不做终端注入，也不启动常驻进程。

## 安装

在包含本插件的目录（`spinner-zh/`，其中有 `.claude-plugin/marketplace.json`）执行：

```bash
claude plugin marketplace add ./spinner-zh
claude plugin install spinner-zh-verbs@spinner-zh-marketplace
```

安装后需要重启 Claude Code 会话，或在会话中执行 `/reload-plugins`。安装会按 Claude Code 自身机制在 `settings.json` 记录 `extraKnownMarketplaces` 与 `enabledPlugins`，但不会写入 `spinnerVerbs`；等待文案只在你主动执行 `/spinner-zh-verbs:enable` 后才改变。

## 命令

| 命令 | 作用 |
| --- | --- |
| `/spinner-zh-verbs:enable <分类>` | 首次启用：保存原值后写入分类文案 |
| `/spinner-zh-verbs:category <分类>` | 切换分类，保留最初备份 |
| `/spinner-zh-verbs:status` | 查看启用状态、分类、条数、备份与一致性 |
| `/spinner-zh-verbs:restore` | 只把 `spinnerVerbs` 恢复为启用前原值 |

分类与条数见完整说明的 README。未启用时 `category` 会拒绝写入；检测到 `spinnerVerbs` 与本插件记录不一致时，`enable`、`category`、`restore` 都会报告冲突而不覆盖，确认可覆盖时可分别加 `--adopt` 或 `--force`。

## 行为说明

Claude Code 在每次等待开始时从 `spinnerVerbs.verbs` 里随机取一个词并保持整轮，因此文案在一轮等待内不会变化，切换只会在下一轮等待生效。`mode` 固定为 `replace`，即只显示中文文案，不混入内置英文动词。

## 许可与来源

中文文案取自 [01Virex/dsh-status-rotator](https://github.com/01Virex/dsh-status-rotator)（MIT License），原许可证副本见 `LICENSE-UPSTREAM-MIT`。插件代码同样以 MIT 发布，见 `LICENSE`。
