# 来源与许可声明

## 中文文案

- 来源仓库：[01Virex/dsh-status-rotator](https://github.com/01Virex/dsh-status-rotator)
- 来源文件：`config.example.json`（该仓库的随包词库）
- 来源提交：`bf980a6d6c9dd1fce87cb9b1611cf5d42f5c10e1`（2026-10-19）
- 文件 SHA-256：`4b1a07dd00071103f0c0bf4418494f7e2ef2b37f96d8b19db2f7c14151807af6`
- 上游许可：MIT License，Copyright (c) 2026 01Virex，完整文本见 `LICENSE-UPSTREAM-MIT`

上游以 MIT 许可发布，允许复制、修改、合并、发布与再许可，条件是保留版权声明与许可声明。本插件原样保留每条中文文案的文字内容，并按上游的词库包（分类）拆分，同时保留 `LICENSE-UPSTREAM-MIT` 与本声明。

## 对上游内容的改动

- 只取中文（`phrases.zh`）条目，未取英文条目。
- 排除 17 条含 `{占位符}` 的文案：Claude Code 的 `spinnerVerbs` 不做占位符替换，保留会导致界面上直接显示花括号。
- 去掉同一分类内完全重复的条目（共 40 条：deepseek 分类 2 条、community 分类 38 条）。
- 未改动任何文案的文字、标点与省略号。

## 本插件代码

MIT License，Copyright (c) 2026 Kira，见 `LICENSE`。

## 参考实现

参考了 [reggiechan74/cc-plugins](https://github.com/reggiechan74/cc-plugins) 中 `spinnerverbs-plugin` 的插件组织方式（`.claude-plugin/plugin.json` + 命令文件 + marketplace 安装）。该实现以写文件的方式直接生成 `settings.json`，没有备份、恢复与冲突检测；本插件的配置写入、备份与冲突处理为本仓库自行实现，未复制其代码或模板。
