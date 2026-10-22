---
name: status
description: 查看中文等待文案插件的启用状态、当前分类、写入条数、备份原始值与一致性检查结果。只读，不改配置。
argument-hint: "[--json]"
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/spinner-zh-verbs.mjs *)
disable-model-invocation: true
---

运行下面的命令并转述结果：

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/spinner-zh-verbs.mjs status $ARGUMENTS
```

执行规则：

1. 原样执行命令。这是只读操作，不要为它修改任何文件。
2. 转述时保留：设置文件路径、是否已启用、分类与条数、备份内容、当前文件中的 spinnerVerbs、以及一致性检查结论。
3. 一致性检查结论为「不一致」时，明确告诉用户插件不会覆盖，并给出 `/spinner-zh-verbs:enable <分类> --adopt` 与手工清理两条路径供其选择。
4. 不要自动执行 `enable`、`category` 或 `restore`。
