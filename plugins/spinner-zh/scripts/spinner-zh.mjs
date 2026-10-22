#!/usr/bin/env node
// spinner-zh：把分类中文文案写入 Claude Code 的 spinnerVerbs 原生配置。
// 只读写设置文件里的 spinnerVerbs 键，其余字段原样保留。
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PHRASE_DIR = resolve(HERE, "..", "phrases");

const USAGE = `用法：spinner-zh.mjs <命令> [参数]

命令：
  list                       列出分类与条数
  enable <分类|all>          启用并写入 spinnerVerbs（首次启用时保存原值）
  category <分类|all>        切换分类（需先启用）
  status                     查看当前状态
  restore [--force]          只恢复 spinnerVerbs 字段

通用参数：
  --settings <路径>          设置文件（默认 $CLAUDE_CONFIG_DIR/settings.json 或 ~/.claude/settings.json）
  --state-dir <路径>         备份与状态目录（默认 <设置文件所在目录>/spinner-zh）
  --adopt                    当前 spinnerVerbs 与记录不符时，先保存现值再写入
  --json                     以 JSON 输出（list/status）
  -h, --help                 显示本帮助`;

class UsageError extends Error {}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { _: [], flags: new Set() };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--settings" || token === "--state-dir") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) throw new UsageError(`${token} 需要一个路径参数`);
      out[token === "--settings" ? "settings" : "stateDir"] = value;
      i += 1;
    } else if (["--adopt", "--force", "--json"].includes(token)) {
      out.flags.add(token.slice(2));
    } else if (token === "-h" || token === "--help") {
      out.flags.add("help");
    } else if (token.startsWith("--")) {
      throw new UsageError(`未知参数：${token}`);
    } else {
      out._.push(token);
    }
  }
  return out;
}

function settingsPathOf(flagPath) {
  if (flagPath) return resolve(flagPath);
  const override = process.env.SPINNER_ZH_SETTINGS;
  if (override && override.trim() !== "") return resolve(override);
  const configDir = process.env.CLAUDE_CONFIG_DIR;
  if (configDir && configDir.trim() !== "") return resolve(configDir, "settings.json");
  return join(homedir(), ".claude", "settings.json");
}

function stateDirOf(flagPath, settingsPath) {
  if (flagPath) return resolve(flagPath);
  const override = process.env.SPINNER_ZH_STATE_DIR;
  if (override && override.trim() !== "") return resolve(override);
  return join(dirname(settingsPath), "spinner-zh");
}

// 符号链接指向真实文件时写入目标，避免替换掉链接本身。
function resolveWriteTarget(path) {
  if (!existsSync(path)) return path;
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function sniffFormat(text) {
  if (text === null || !text.includes("\n")) {
    return { multiline: false, indent: "  ", trailingNewline: text !== null && text.endsWith("\n") };
  }
  const match = text.match(/\n([ \t]+)"/);
  return {
    multiline: true,
    indent: match ? match[1] : "  ",
    trailingNewline: text.endsWith("\n"),
  };
}

function readSettings(path) {
  if (!existsSync(path)) {
    return { exists: false, data: {}, format: { multiline: true, indent: "  ", trailingNewline: true } };
  }
  const text = readFileSync(path, "utf8");
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} 不是合法 JSON，未做任何修改：${error.message}`);
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${path} 的顶层不是 JSON 对象，未做任何修改`);
  }
  return { exists: true, data, format: sniffFormat(text) };
}

function writeSettings(path, data, format) {
  const text = format.multiline
    ? JSON.stringify(data, null, format.indent) + (format.trailingNewline ? "\n" : "")
    : JSON.stringify(data);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.spinner-zh-${process.pid}.tmp`;
  const mode = existsSync(path) ? statSync(path).mode : 0o600;
  writeFileSync(tmp, text, { mode });
  renameSync(tmp, path);
}

function hashValue(value) {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

function readJsonFile(path, label) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${label} ${path} 损坏，拒绝改动设置：${error.message}`);
  }
}

function writeJsonFile(path, value, mode = 0o600) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode });
  renameSync(tmp, path);
}

function statePathOf(stateDir) {
  return join(stateDir, "state.json");
}

function backupPathOf(stateDir) {
  return join(stateDir, "backup.json");
}

function loadCatalog() {
  const indexPath = join(PHRASE_DIR, "index.json");
  if (!existsSync(indexPath)) throw new Error(`文案索引缺失：${indexPath}`);
  const index = JSON.parse(readFileSync(indexPath, "utf8"));
  const categories = index.categories.map((entry) => {
    const doc = JSON.parse(readFileSync(join(PHRASE_DIR, entry.file), "utf8"));
    if (!Array.isArray(doc.phrases) || doc.phrases.length === 0) throw new Error(`分类 ${entry.id} 的文案为空`);
    return { id: entry.id, label: entry.label, phrases: doc.phrases };
  });
  const all = JSON.parse(readFileSync(join(PHRASE_DIR, "all.json"), "utf8")).phrases;
  return { categories, all, totals: index.totals };
}

function resolvePhrases(catalog, name) {
  if (name === "all") return { id: "all", label: { zh: "全部分类", en: "All categories" }, phrases: catalog.all };
  const hit = catalog.categories.find((entry) => entry.id === name);
  if (!hit) {
    const names = catalog.categories.map((entry) => entry.id).join("、");
    throw new UsageError(`未知分类：${name}\n可用分类：${names}、all`);
  }
  return hit;
}

// 当前 spinnerVerbs 相对本插件分四类：
// ours = 本插件写入且未被改动；original = 等于启用前原值；absent = 没有该键；foreign = 其他。
function classify(settings, state, backup) {
  const value = settings.data.spinnerVerbs;
  const present = value !== undefined;
  if (state?.enabled && state.appliedHash && hashValue(value) === state.appliedHash) return { kind: "ours", present, value };
  if (backup) {
    const sameAsOriginal = present === Boolean(backup.original?.present) &&
      (!present || hashValue(value) === hashValue(backup.original.value));
    if (sameAsOriginal) return { kind: "original", present, value };
  }
  return { kind: present ? "foreign" : "absent", present, value };
}

function describeVerbs(value) {
  if (value === undefined) return "（无 spinnerVerbs 键）";
  const mode = value && typeof value === "object" ? value.mode ?? "未设置" : "非对象";
  const count = value && Array.isArray(value.verbs) ? value.verbs.length : 0;
  return `mode=${mode}，verbs=${count} 条`;
}

function uniqueVerbs(category) {
  const seen = new Set();
  const verbs = [];
  for (const phrase of category.phrases) {
    if (seen.has(phrase)) continue;
    seen.add(phrase);
    verbs.push(phrase);
  }
  return verbs;
}

function writeApplied({ settingsPath, settings, stateDir, category, state, backup, adopt }) {
  const verbs = uniqueVerbs(category);
  const value = { mode: "replace", verbs };

  // 备份先于写入，保证任何一次成功写入都有可恢复的原值。
  let backupPath = backupPathOf(stateDir);
  let createdBackup = false;
  if (!backup) {
    const original = settings.data.spinnerVerbs;
    writeJsonFile(backupPath, {
      schema: 1,
      createdAt: new Date().toISOString(),
      settingsPath,
      adopted: adopt === true && original !== undefined,
      original: original === undefined ? { present: false, value: null } : { present: true, value: original },
    });
    createdBackup = true;
  }

  writeSettings(settingsPath, { ...settings.data, spinnerVerbs: value }, settings.format);

  const now = new Date().toISOString();
  writeJsonFile(statePathOf(stateDir), {
    schema: 1,
    enabled: true,
    category: category.id,
    verbCount: verbs.length,
    appliedHash: hashValue(value),
    settingsPath,
    enabledAt: state?.enabledAt ?? now,
    updatedAt: now,
  });

  return { verbs, backupPath, createdBackup };
}

function guardForeign(classification, settingsPath, state, backup, { allowAdopt }) {
  if (classification.kind !== "foreign" || allowAdopt) return;
  const firstTime = !state && !backup;
  fail([
    `检测到冲突：${settingsPath} 里已经有 spinnerVerbs，与本插件的记录不一致，未修改任何内容。`,
    `当前值：${describeVerbs(classification.value)}`,
    `插件记录：${state?.enabled ? `已启用（分类 ${state.category}）` : "从未启用过"}`,
    `启用前原值：${backup ? (backup.original.present ? describeVerbs(backup.original.value) : "没有 spinnerVerbs 键") : "无备份"}`,
    "",
    firstTime
      ? "这个键可能由其他插件或你本人设置。可选处理："
      : "可选处理：",
    "  1. 自行确认并移除或改写该键后重试；",
    "  2. 确认可以覆盖后加 --adopt 重试：当前值会写入备份成为「启用前原值」，之后 restore 会还原到它。",
  ].join("\n"));
}

function cmdList(args) {
  const catalog = loadCatalog();
  if (args.flags.has("json")) {
    process.stdout.write(`${JSON.stringify({
      categories: catalog.categories.map((entry) => ({ id: entry.id, label: entry.label, count: entry.phrases.length })),
      all: catalog.all.length,
      totals: catalog.totals,
    }, null, 2)}\n`);
    return;
  }
  const lines = [
    `共 ${catalog.categories.length} 个分类；全部分类去重后 ${catalog.all.length} 条。`,
    "",
    "分类 ID          条数  名称",
  ];
  for (const category of catalog.categories) {
    lines.push(`${category.id.padEnd(16)}${String(category.phrases.length).padStart(4)}  ${category.label?.zh ?? ""}`);
  }
  lines.push(`${"all".padEnd(16)}${String(catalog.all.length).padStart(4)}  全部分类`);
  process.stdout.write(`${lines.join("\n")}\n`);
}

function runEnable(args, { requireEnabled }) {
  const requested = args._[1];
  if (!requested) {
    throw new UsageError(
      requireEnabled
        ? "缺少分类参数，例如：category coding；不带参数时可用：list"
        : "缺少分类参数，例如：enable deepseek 或 enable all",
    );
  }
  const catalog = loadCatalog();
  const category = resolvePhrases(catalog, requested);
  const settingsPath = resolveWriteTarget(settingsPathOf(args.settings));
  const stateDir = stateDirOf(args.stateDir, settingsPath);
  const settings = readSettings(settingsPath);
  const state = readJsonFile(statePathOf(stateDir), "状态文件");
  const backup = readJsonFile(backupPathOf(stateDir), "备份文件");

  if (requireEnabled && !state?.enabled) {
    fail("尚未启用，未修改任何内容。请先运行 /spinner-zh:enable <分类>。");
  }

  if (state?.enabled && !backup && !args.flags.has("adopt")) {
    fail([
      `状态文件显示已启用，但备份文件 ${backupPathOf(stateDir)} 不存在。`,
      "原始 spinnerVerbs 无法核对，未修改任何内容。",
      "确认可覆盖时加 --adopt 重新运行，会以当前值重新建立备份。",
    ].join("\n"));
  }

  const classification = classify(settings, state, backup);
  const adopt = args.flags.has("adopt");
  guardForeign(classification, settingsPath, state, backup, { allowAdopt: adopt });

  if (classification.kind === "ours" && state?.category === category.id && backup && !adopt) {
    process.stdout.write([
      `当前已经是「${category.label?.zh ?? category.id}」，未重复写入。`,
      `设置文件：${settingsPath}`,
      `备份：${backupPathOf(stateDir)}（保持最初备份不变）`,
    ].join("\n") + "\n");
    return;
  }

  const result = writeApplied({ settingsPath, settings, stateDir, category, state, backup, adopt });
  const lines = [
    `${requireEnabled ? "已切换分类" : "已启用"}：${category.label?.zh ?? category.id}，写入 ${result.verbs.length} 条中文文案。`,
    `设置文件：${settingsPath}`,
    "spinnerVerbs：mode=replace",
    result.createdBackup ? `已保存启用前原值：${result.backupPath}` : `沿用最初备份：${result.backupPath}`,
    "settings.json 的其他字段未改动。",
    "生效时机：下一次等待开始时取用；同一次等待过程中不会切换文案。",
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}

function cmdStatus(args) {
  const settingsPath = resolveWriteTarget(settingsPathOf(args.settings));
  const stateDir = stateDirOf(args.stateDir, settingsPath);
  const settings = readSettings(settingsPath);
  const state = readJsonFile(statePathOf(stateDir), "状态文件");
  const backup = readJsonFile(backupPathOf(stateDir), "备份文件");
  const classification = classify(settings, state, backup);
  const current = settings.data.spinnerVerbs;
  const report = {
    settingsPath,
    stateDir,
    enabled: Boolean(state?.enabled),
    category: state?.category ?? null,
    recordedVerbs: state?.verbCount ?? null,
    current: {
      present: classification.present,
      mode: current && typeof current === "object" ? current.mode ?? null : null,
      verbs: current && Array.isArray(current.verbs) ? current.verbs.length : 0,
    },
    consistency: classification.kind,
    backup: backup
      ? {
          createdAt: backup.createdAt,
          originalPresent: Boolean(backup.original?.present),
          original: backup.original?.present ? describeVerbs(backup.original.value) : "no spinnerVerbs key",
        }
      : null,
  };
  if (args.flags.has("json")) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  const lines = [`设置文件：${settingsPath}`, `插件数据目录：${stateDir}`];
  if (!state && !backup) {
    lines.push("状态：未启用；本插件尚未写入过任何配置。");
  } else {
    lines.push(`状态：${state?.enabled ? "已启用" : "未启用"}`);
    if (state?.category) lines.push(`分类：${state.category}（写入 ${state.verbCount} 条）`);
    if (state?.updatedAt) lines.push(`最近写入：${state.updatedAt}`);
    lines.push(`备份：${backup ? `${backup.original.present ? describeVerbs(backup.original.value) : "启用前没有 spinnerVerbs 键"}（${backup.createdAt}）` : "无"}`);
  }
  lines.push(`当前文件：${describeVerbs(current)}`);
  const consistency = {
    ours: "当前值由本插件写入，与记录一致",
    original: "当前值等于启用前原值",
    absent: "当前没有 spinnerVerbs 键",
    foreign: "当前值与本插件记录不符（可能由其他工具或手工改动）",
  }[classification.kind];
  lines.push(`一致性：${consistency}`);
  process.stdout.write(`${lines.join("\n")}\n`);
}

function cmdRestore(args) {
  const settingsPath = resolveWriteTarget(settingsPathOf(args.settings));
  const stateDir = stateDirOf(args.stateDir, settingsPath);
  const settings = readSettings(settingsPath);
  const state = readJsonFile(statePathOf(stateDir), "状态文件");
  const backup = readJsonFile(backupPathOf(stateDir), "备份文件");
  if (!backup) {
    fail(`未找到备份 ${backupPathOf(stateDir)}，没有可恢复的原值，未修改任何内容。`);
  }
  const classification = classify(settings, state, backup);
  const force = args.flags.has("force");
  if (classification.kind === "original" && !state?.enabled) {
    process.stdout.write([
      "当前 spinnerVerbs 已等于启用前原值，未做改动。",
      `设置文件：${settingsPath}`,
    ].join("\n") + "\n");
    return;
  }
  if (classification.kind === "foreign" && !force) {
    fail([
      "检测到冲突：当前 spinnerVerbs 与本插件写入值、启用前原值都不同，未修改任何内容。",
      `当前值：${describeVerbs(settings.data.spinnerVerbs)}`,
      `启用前原值：${backup.original.present ? describeVerbs(backup.original.value) : "没有 spinnerVerbs 键"}`,
      "",
      "确认要用启用前原值覆盖当前值时，加 --force 重试。",
    ].join("\n"));
  }

  const next = { ...settings.data };
  if (backup.original.present) next.spinnerVerbs = backup.original.value;
  else delete next.spinnerVerbs;
  writeSettings(settingsPath, next, settings.format);
  writeJsonFile(statePathOf(stateDir), {
    schema: 1,
    enabled: false,
    category: null,
    verbCount: 0,
    appliedHash: null,
    settingsPath,
    enabledAt: state?.enabledAt ?? null,
    restoredAt: new Date().toISOString(),
  });

  const lines = [
    backup.original.present ? `已恢复 spinnerVerbs 原值：${describeVerbs(backup.original.value)}` : "已删除 spinnerVerbs 键，回到启用前的状态。",
    `设置文件：${settingsPath}`,
    "只改动 spinnerVerbs；其他字段与备份文件均未改动。",
  ];
  if (classification.kind === "foreign") lines.push("注意：本次使用 --force，覆盖了插件记录之外的 spinnerVerbs 值。");
  process.stdout.write(`${lines.join("\n")}\n`);
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    fail(`${error.message}\n\n${USAGE}`);
  }
  if (args.flags.has("help") || args._.length === 0) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  const commands = {
    list: cmdList,
    enable: (a) => runEnable(a, { requireEnabled: false }),
    category: (a) => runEnable(a, { requireEnabled: true }),
    status: cmdStatus,
    restore: cmdRestore,
  };
  const handler = commands[args._[0]];
  if (!handler) fail(`未知命令：${args._[0]}\n\n${USAGE}`);
  try {
    handler(args);
  } catch (error) {
    if (error instanceof UsageError) fail(`${error.message}\n\n${USAGE}`);
    fail(error.message);
  }
}

main();
