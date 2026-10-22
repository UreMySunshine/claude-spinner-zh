---
name: enable
description: 启用中文等待文案，把指定分类写进 Claude Code 原生 spinnerVerbs 配置。首次启用前保存原值；检测到外部改动时报告冲突而不覆盖。
argument-hint: "<分类ID|all> [--adopt]"
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/spinner-zh-verbs.mjs *)
disable-model-invocation: true
---

运行下面的命令，把用户指定的分类写进 `spinnerVerbs`：

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/spinner-zh-verbs.mjs enable $ARGUMENTS
```

执行规则：

1. 原样执行上面的命令，`$ARGUMENTS` 是用户输入的分类 ID（例如 `deepseek`）或 `all`；不要自行改写分类名、不要手工编辑 `settings.json`。
2. 把命令的标准输出逐字转述给用户，至少包含：写入的分类、条数、设置文件路径、备份路径和生效时机。
3. 命令以非零状态退出时，不要重试、不要加 `--adopt` 或 `--force` 自动绕过；把错误信息转述给用户，并等用户决定。
4. 用户没有给出分类时，先运行 `${CLAUDE_PLUGIN_ROOT}/scripts/spinner-zh-verbs.mjs list` 展示分类，再询问要启用哪一个。
5. 本插件只写 `spinnerVerbs` 一个键；不要为完成本命令修改 `settings.json` 的其他内容，也不要新装依赖或联网。
