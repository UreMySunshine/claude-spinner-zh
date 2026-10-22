---
name: category
description: 切换 Claude Code 等待文案的分类。读取已保存的备份与状态，只改写 spinnerVerbs；尚未启用时拒绝写入。
argument-hint: "<分类ID|all>"
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/spinner-zh.mjs *)
disable-model-invocation: true
---

运行下面的命令切换分类：

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/spinner-zh.mjs category $ARGUMENTS
```

执行规则：

1. 原样执行上面的命令，`$ARGUMENTS` 是分类 ID 或 `all`。不要手工编辑 `settings.json`。
2. 把标准输出逐字转述给用户，至少包含分类名、条数、设置文件路径与生效时机。
3. 命令以非零状态退出时不要重试，也不要自行加 `--adopt` 或 `--force`；把错误信息转述给用户并等其决定。
4. 用户没有给出分类时，先运行 `${CLAUDE_PLUGIN_ROOT}/scripts/spinner-zh.mjs list` 展示分类，再询问要切换到哪一个。
5. 首次使用请改用 `/spinner-zh:enable`；本命令在未启用时会拒绝执行，这是预期行为。
