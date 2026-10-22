#!/usr/bin/env node
// 配置读写测试：全部在临时目录内进行，不读写真实 ~/.claude。
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync, symlinkSync, statSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(HERE, "..", "plugins", "spinner-zh-verbs", "scripts", "spinner-zh-verbs.mjs");
const PHRASES = resolve(HERE, "..", "plugins", "spinner-zh-verbs", "phrases");

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures.push({ name, message: error.message });
    console.log(`  FAIL ${name}\n       ${error.message.split("\n").join("\n       ")}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message}\n  实际：${a}\n  期望：${e}`);
}

function run(root, args, { expectFailure = false } = {}) {
  const env = {
    ...process.env,
    SPINNER_ZH_SETTINGS: join(root, "settings.json"),
    SPINNER_ZH_STATE_DIR: join(root, "state"),
  };
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (expectFailure) throw new Error(`命令 ${args.join(" ")} 预期失败，却以 0 退出：${stdout}`);
    return { code: 0, stdout, stderr: "" };
  } catch (error) {
    if (expectFailure) {
      if (error.message.startsWith("命令 ")) throw error;
      return { code: error.status ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
    }
    throw new Error(`命令 ${args.join(" ")} 意外失败（退出码 ${error.status}）：${error.stderr || error.stdout}`);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function withRoot(fn) {
  const root = mkdtempSync(join(tmpdir(), "spinner-zh-test-"));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function writeSettings(root, value, { indent = 2 } = {}) {
  writeFileSync(join(root, "settings.json"), `${JSON.stringify(value, null, indent)}\n`);
}

// 真实用户配置的只读指纹，用于证明测试未触碰 ~/.claude。
const realSettings = join(homedir(), ".claude", "settings.json");
const realBefore = existsSync(realSettings) ? { hash: hashFile(realSettings), mtime: statSync(realSettings).mtimeMs } : null;

const catalog = readJson(join(PHRASES, "index.json"));
const categoryIds = catalog.categories.map((entry) => entry.id);

console.log("\n[1] 分类资源");

test("分类数量与 index.json 一致", () => {
  assert(catalog.categories.length === 14, `期望 14 个分类，实际 ${catalog.categories.length}`);
});

test("每个分类文件非空且与其条数一致", () => {
  for (const entry of catalog.categories) {
    const doc = readJson(join(PHRASES, entry.file));
    assert(Array.isArray(doc.phrases), `${entry.id} 的 phrases 不是数组`);
    assertEqual(doc.phrases.length, entry.count, `${entry.id} 条数不一致`);
  }
});

test("全部文案去重后与 all.json 一致", () => {
  const all = readJson(join(PHRASES, "all.json")).phrases;
  const union = new Set();
  for (const entry of catalog.categories) for (const phrase of readJson(join(PHRASES, entry.file)).phrases) union.add(phrase);
  assertEqual([...union].sort(), [...new Set(all)].sort(), "分类并集与 all.json 不一致");
});

test("文案均不含占位符、控制字符，且以省略号结尾", () => {
  const all = readJson(join(PHRASES, "all.json")).phrases;
  const bad = all.filter((text) => /[{}]/.test(text) || /[\u0000-\u001f\u007f]/.test(text) || !/(…|\.\.\.)$/.test(text));
  assertEqual(bad.slice(0, 5), [], "存在不合格文案");
});

test("资源声明了上游来源与 MIT 许可", () => {
  assert(catalog.source.repository.includes("dsh-status-rotator"), "缺少上游来源");
  assert(catalog.source.license === "MIT", "缺少 MIT 许可声明");
  assert(catalog.attribution.includes("MIT"), "缺少署名与许可说明");
});

console.log("\n[2] 首次启用");

test("无 settings.json 时创建文件并写入 spinnerVerbs", () => withRoot((root) => {
  const out = run(root, ["enable", "deepseek"]).stdout;
  const settings = readJson(join(root, "settings.json"));
  assertEqual(Object.keys(settings), ["spinnerVerbs"], "不应写入其他键");
  assertEqual(settings.spinnerVerbs.mode, "replace", "mode 应为 replace");
  assert(settings.spinnerVerbs.verbs.length > 0, "verbs 为空");
  assert(out.includes("已启用"), "输出未说明已启用");
  assert(existsSync(join(root, "state", "backup.json")), "未生成备份");
  assert(existsSync(join(root, "state", "state.json")), "未生成状态文件");
}));

test("备份记录启用前没有 spinnerVerbs 键", () => withRoot((root) => {
  run(root, ["enable", "coding"]);
  const backup = readJson(join(root, "state", "backup.json"));
  assertEqual(backup.original, { present: false, value: null }, "备份内容不正确");
}));

test("保留 settings.json 其他字段与键顺序", () => withRoot((root) => {
  writeSettings(root, { model: "opus", permissions: { allow: ["Bash(ls *)"] }, env: { FOO: "bar" } });
  run(root, ["enable", "coding"]);
  const settings = readJson(join(root, "settings.json"));
  assertEqual(Object.keys(settings), ["model", "permissions", "env", "spinnerVerbs"], "键顺序或字段被改动");
  assertEqual(settings.permissions, { allow: ["Bash(ls *)"] }, "permissions 被改动");
  assertEqual(settings.env, { FOO: "bar" }, "env 被改动");
}));

test("保留原有缩进与结尾换行", () => withRoot((root) => {
  writeFileSync(join(root, "settings.json"), '{\n    "model": "opus"\n}\n');
  run(root, ["enable", "daily"]);
  const text = readFileSync(join(root, "settings.json"), "utf8");
  assert(text.includes('\n    "model"'), "缩进被改成 2 空格");
  assert(text.endsWith("\n"), "缺少结尾换行");
}));

test("写入的 verbs 与分类资源逐条一致且去重", () => withRoot((root) => {
  run(root, ["enable", "star-route"]);
  const expected = [...new Set(readJson(join(PHRASES, "star-route.json")).phrases)];
  const actual = readJson(join(root, "settings.json")).spinnerVerbs.verbs;
  assertEqual(actual, expected, "verbs 与资源不一致");
  assertEqual(new Set(actual).size, actual.length, "verbs 有重复");
}));

test("all 分类写入全部去重文案", () => withRoot((root) => {
  run(root, ["enable", "all"]);
  const verbs = readJson(join(root, "settings.json")).spinnerVerbs.verbs;
  assertEqual(verbs.length, readJson(join(PHRASES, "all.json")).phrases.length, "all 条数不一致");
}));

console.log("\n[3] 重复启用与切换分类");

test("重复启用同一分类不改写文件", () => withRoot((root) => {
  run(root, ["enable", "daily"]);
  const before = hashFile(join(root, "settings.json"));
  const out = run(root, ["enable", "daily"]).stdout;
  assert(out.includes("未重复写入"), "输出未说明跳过");
  assertEqual(hashFile(join(root, "settings.json")), before, "文件被重复写入");
}));

test("切换分类保留最初备份不被覆盖", () => withRoot((root) => {
  writeSettings(root, { spinnerVerbs: { mode: "append", verbs: ["Pondering"] }, model: "opus" });
  run(root, ["enable", "coding", "--adopt"]);
  const firstBackup = readFileSync(join(root, "state", "backup.json"), "utf8");
  run(root, ["category", "deepseek"]);
  run(root, ["enable", "slacking"]);
  assertEqual(readFileSync(join(root, "state", "backup.json"), "utf8"), firstBackup, "最初备份被覆盖");
  assertEqual(readJson(join(root, "settings.json")).spinnerVerbs.mode, "replace", "mode 被改动");
  assertEqual(readJson(join(root, "state", "state.json")).category, "slacking", "状态未更新");
}));

test("切换分类后 restore 仍还原到最初原值", () => withRoot((root) => {
  const original = { mode: "append", verbs: ["Pondering", "Crafting"] };
  writeSettings(root, { spinnerVerbs: original, model: "opus" });
  run(root, ["enable", "coding", "--adopt"]);
  run(root, ["category", "math-physics"]);
  run(root, ["restore"]);
  assertEqual(readJson(join(root, "settings.json")).spinnerVerbs, original, "未还原最初原值");
}));

test("category 在未启用时拒绝写入", () => withRoot((root) => {
  writeSettings(root, { model: "opus" });
  const result = run(root, ["category", "coding"], { expectFailure: true });
  assert(result.stderr.includes("尚未启用"), "错误信息未说明未启用");
  assertEqual(readJson(join(root, "settings.json")), { model: "opus" }, "文件被改动");
  assert(!existsSync(join(root, "state", "backup.json")), "未启用却生成了备份");
}));

console.log("\n[4] 冲突检测");

test("首次启用遇到已有 spinnerVerbs 时拒绝覆盖", () => withRoot((root) => {
  const original = { mode: "append", verbs: ["Pondering"] };
  writeSettings(root, { spinnerVerbs: original, model: "opus" });
  const result = run(root, ["enable", "coding"], { expectFailure: true });
  assert(result.stderr.includes("检测到冲突"), "错误信息未提示冲突");
  assertEqual(readJson(join(root, "settings.json")).spinnerVerbs, original, "冲突时仍改写了配置");
  assert(!existsSync(join(root, "state", "backup.json")), "冲突时仍写入备份");
}));

test("--adopt 把现值作为原值备份后再写入", () => withRoot((root) => {
  const original = { mode: "append", verbs: ["Pondering"] };
  writeSettings(root, { spinnerVerbs: original });
  run(root, ["enable", "coding", "--adopt"]);
  assertEqual(readJson(join(root, "state", "backup.json")).original.value, original, "未把现值记入备份");
  assertEqual(readJson(join(root, "state", "backup.json")).adopted, true, "未标记 adopted");
  run(root, ["restore"]);
  assertEqual(readJson(join(root, "settings.json")).spinnerVerbs, original, "restore 未还原现值");
}));

test("启用后外部改动 spinnerVerbs 时切换分类被拒绝", () => withRoot((root) => {
  run(root, ["enable", "coding"]);
  const settings = readJson(join(root, "settings.json"));
  settings.spinnerVerbs = { mode: "replace", verbs: ["手工写入"] };
  writeSettings(root, settings);
  const before = readFileSync(join(root, "settings.json"), "utf8");
  const result = run(root, ["category", "daily"], { expectFailure: true });
  assert(result.stderr.includes("检测到冲突"), "未提示冲突");
  assertEqual(readFileSync(join(root, "settings.json"), "utf8"), before, "冲突时改写了文件");
}));

test("启用后外部改动 spinnerVerbs 时 restore 需 --force", () => withRoot((root) => {
  run(root, ["enable", "coding"]);
  const settings = readJson(join(root, "settings.json"));
  settings.spinnerVerbs = { mode: "append", verbs: ["手工写入"] };
  writeSettings(root, settings);
  const before = readFileSync(join(root, "settings.json"), "utf8");
  const result = run(root, ["restore"], { expectFailure: true });
  assert(result.stderr.includes("检测到冲突"), "未提示冲突");
  assertEqual(readFileSync(join(root, "settings.json"), "utf8"), before, "--force 之外仍改写了文件");
}));

test("restore --force 覆盖外部改动并恢复原值", () => withRoot((root) => {
  const original = { mode: "append", verbs: ["Pondering"] };
  writeSettings(root, { spinnerVerbs: original });
  run(root, ["enable", "coding", "--adopt"]);
  const settings = readJson(join(root, "settings.json"));
  settings.spinnerVerbs = { mode: "replace", verbs: ["外部工具写的"] };
  writeSettings(root, settings);
  const out = run(root, ["restore", "--force"]).stdout;
  assert(out.includes("--force"), "未提示使用了 --force");
  assertEqual(readJson(join(root, "settings.json")).spinnerVerbs, original, "未恢复原值");
}));

test("状态目录指向缺失备份时拒绝写入", () => withRoot((root) => {
  run(root, ["enable", "coding"]);
  rmSync(join(root, "state", "backup.json"));
  const before = readFileSync(join(root, "settings.json"), "utf8");
  const result = run(root, ["category", "daily"], { expectFailure: true });
  assert(result.stderr.includes("备份文件"), "未提示备份缺失");
  assertEqual(readFileSync(join(root, "settings.json"), "utf8"), before, "缺备份时仍改写");
}));

console.log("\n[5] 恢复与保留其他字段");

test("restore 删除原本不存在的 spinnerVerbs 键", () => withRoot((root) => {
  run(root, ["enable", "coding"]);
  run(root, ["restore"]);
  const settings = readJson(join(root, "settings.json"));
  assert(!("spinnerVerbs" in settings), "spinnerVerbs 未被删除");
  assertEqual(readJson(join(root, "state", "state.json")).enabled, false, "状态未标记为未启用");
}));

test("restore 保留启用后用户修改的其他字段", () => withRoot((root) => {
  writeSettings(root, { model: "opus", spinnerVerbs: { mode: "append", verbs: ["Pondering"] } });
  run(root, ["enable", "coding", "--adopt"]);
  const settings = readJson(join(root, "settings.json"));
  settings.model = "sonnet";
  settings.permissions = { allow: ["Read"] };
  writeSettings(root, settings);
  run(root, ["restore"]);
  const after = readJson(join(root, "settings.json"));
  assertEqual(after.model, "sonnet", "用户后续修改的 model 被覆盖");
  assertEqual(after.permissions, { allow: ["Read"] }, "用户后续新增的权限被覆盖");
  assertEqual(after.spinnerVerbs, { mode: "append", verbs: ["Pondering"] }, "未还原 spinnerVerbs");
}));

test("restore 后再次 enable 会沿用最初备份", () => withRoot((root) => {
  writeSettings(root, { spinnerVerbs: { mode: "append", verbs: ["Pondering"] } });
  run(root, ["enable", "coding", "--adopt"]);
  const backup = readFileSync(join(root, "state", "backup.json"), "utf8");
  run(root, ["restore"]);
  run(root, ["enable", "daily"]);
  assertEqual(readFileSync(join(root, "state", "backup.json"), "utf8"), backup, "最初备份被覆盖");
}));

test("已恢复状态下 restore 不再改动文件", () => withRoot((root) => {
  run(root, ["enable", "coding"]);
  run(root, ["restore"]);
  const before = hashFile(join(root, "settings.json"));
  const out = run(root, ["restore"]).stdout;
  assert(out.includes("未做改动"), "输出未说明无改动");
  assertEqual(hashFile(join(root, "settings.json")), before, "重复 restore 改写了文件");
}));

console.log("\n[6] 状态与错误处理");

test("status --json 字段完整且可解析", () => withRoot((root) => {
  run(root, ["enable", "internet-memes"]);
  const report = JSON.parse(run(root, ["status", "--json"]).stdout);
  assertEqual(report.enabled, true, "enabled 不为 true");
  assertEqual(report.category, "internet-memes", "分类不一致");
  assertEqual(report.consistency, "ours", "一致性判断不正确");
  assert(report.backup && report.backup.originalPresent === false, "备份信息不正确");
  assertEqual(report.current.mode, "replace", "当前 mode 不正确");
}));

test("status 在未启用时输出未启用", () => withRoot((root) => {
  writeSettings(root, { model: "opus" });
  const out = run(root, ["status"]).stdout;
  assert(out.includes("未启用"), "未提示未启用");
  assert(out.includes("当前没有 spinnerVerbs 键"), "未说明当前没有该键");
}));

test("配置文件不是合法 JSON 时拒绝改动", () => withRoot((root) => {
  writeFileSync(join(root, "settings.json"), "{ not json ");
  const result = run(root, ["enable", "coding"], { expectFailure: true });
  assert(result.stderr.includes("不是合法 JSON"), "未提示 JSON 非法");
  assertEqual(readFileSync(join(root, "settings.json"), "utf8"), "{ not json ", "文件被改写");
}));

test("未知分类与未知命令给出可用列表", () => withRoot((root) => {
  const bad = run(root, ["enable", "nope"], { expectFailure: true });
  assert(bad.stderr.includes("可用分类"), "未列出可用分类");
  const unknown = run(root, ["frobnicate"], { expectFailure: true });
  assert(unknown.stderr.includes("未知命令"), "未提示未知命令");
}));

test("list --json 返回全部分类与条数", () => withRoot((root) => {
  const data = JSON.parse(run(root, ["list", "--json"]).stdout);
  assertEqual(data.categories.length, 14, "分类数不一致");
  assertEqual(data.all, readJson(join(PHRASES, "all.json")).phrases.length, "全部条数不一致");
}));

test("符号链接的设置文件写到链接目标", () => withRoot((root) => {
  const target = join(root, "real-settings.json");
  writeFileSync(target, '{\n  "model": "opus"\n}\n');
  symlinkSync(target, join(root, "settings.json"));
  run(root, ["enable", "ads"]);
  assertEqual(readJson(target).spinnerVerbs.mode, "replace", "未写入链接目标");
  assert(existsSync(join(root, "settings.json")), "符号链接被删除");
}));

test("单行压缩的 settings.json 保持单行", () => withRoot((root) => {
  writeFileSync(join(root, "settings.json"), '{"model":"opus","env":{"A":"b"}}');
  run(root, ["enable", "coding"]);
  const text = readFileSync(join(root, "settings.json"), "utf8");
  assert(!text.includes("\n"), "单行文件被改成了多行");
  assertEqual(readJson(join(root, "settings.json")).model, "opus", "其他字段丢失");
  run(root, ["restore"]);
  assertEqual(readFileSync(join(root, "settings.json"), "utf8"), '{"model":"opus","env":{"A":"b"}}', "恢复后与原文本不一致");
}));

test("状态目录默认位于设置文件同目录", () => withRoot((root) => {
  const env = { ...process.env, SPINNER_ZH_SETTINGS: join(root, "settings.json") };
  delete env.SPINNER_ZH_STATE_DIR;
  execFileSync(process.execPath, [SCRIPT, "enable", "ads"], { env, encoding: "utf8" });
  assert(existsSync(join(root, "spinner-zh-verbs", "backup.json")), "默认备份位置不在设置文件同目录");
}));

test("不残留临时文件", () => withRoot((root) => {
  run(root, ["enable", "coding"]);
  run(root, ["category", "daily"]);
  run(root, ["restore"]);
  const leftovers = readdirSync(root).filter((name) => name.includes(".tmp"));
  const stateLeftovers = readdirSync(join(root, "state")).filter((name) => name.includes(".tmp"));
  assertEqual([...leftovers, ...stateLeftovers], [], "存在临时文件残留");
}));

test("备份与状态文件权限为 600", () => withRoot((root) => {
  run(root, ["enable", "coding"]);
  const mode = statSync(join(root, "state", "backup.json")).mode & 0o777;
  assertEqual(mode, 0o600, `备份权限为 ${mode.toString(8)}`);
}));

console.log("\n[7] 真实配置未被触碰");

test("测试全程未修改 ~/.claude/settings.json", () => {
  if (realBefore === null) {
    assert(!existsSync(realSettings), "测试后出现了 ~/.claude/settings.json");
    return;
  }
  assertEqual(hashFile(realSettings), realBefore.hash, "真实设置文件内容被改动");
  assertEqual(statSync(realSettings).mtimeMs, realBefore.mtime, "真实设置文件被写入");
});

console.log(`\n通过 ${passed} 项，失败 ${failures.length} 项。`);
if (failures.length > 0) {
  console.log("\n失败明细：");
  for (const failure of failures) console.log(`- ${failure.name}: ${failure.message}`);
  process.exit(1);
}
