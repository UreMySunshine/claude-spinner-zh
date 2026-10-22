---
name: restore
description: 停用中文等待文案，只把 spinnerVerbs 恢复为首次启用前保存的原值，保留 settings.json 其他字段与用户后续修改的备份文件。
argument-hint: "[--force]"
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/spinner-zh.mjs *)
disable-model-invocation: true
---

运行下面的命令恢复原配置：

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/spinner-zh.mjs restore $ARGUMENTS
```

执行规则：

1. 原样执行命令，不要手工编辑 `settings.json`，也不要删除备份文件。
2. 把标准输出逐字转述给用户，至少包含：恢复成了什么（原值或删除该键）、设置文件路径、只改动 `spinnerVerbs`。
3. 命令以非零状态退出时不要重试，也不要自行加 `--force`。把冲突信息（当前值、启用前原值）转述给用户，等用户确认是否覆盖。
4. 本命令不重置 `backup.json`；不要为了「清理干净」去删除它。
