#!/usr/bin/env node
// 从 plugins/spinner-zh/phrases 生成 mod 可直接 import 的文案模块。
// mod 的 hooks 模块没有文件系统访问能力，文案必须以 JS 模块形式随插件发布。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const SRC = join(REPO, "plugins", "spinner-zh", "phrases");
const OUT = join(REPO, "plugins", "spinner-zh-mods", "hooks", "phrases.js");

const index = JSON.parse(readFileSync(join(SRC, "index.json"), "utf8"));
const lines = [];

lines.push("// 由 tools/build-mod-phrases.mjs 从 plugins/spinner-zh/phrases 生成，请勿手工编辑。");
lines.push(`// 文案来源：${index.source.repository}（${index.source.license}），提交 ${index.source.commit}`);
lines.push("");
lines.push("export const CATEGORIES = [");

for (const entry of index.categories) {
  const doc = JSON.parse(readFileSync(join(SRC, entry.file), "utf8"));
  if (!Array.isArray(doc.phrases) || doc.phrases.length === 0) {
    throw new Error(`分类 ${entry.id} 的文案为空`);
  }
  lines.push("  {");
  lines.push(`    id: ${JSON.stringify(entry.id)},`);
  lines.push(`    label: ${JSON.stringify(entry.label.zh)},`);
  lines.push(`    phrases: ${JSON.stringify(doc.phrases)},`);
  lines.push("  },");
}

lines.push("];");
lines.push("");
lines.push(`export const ALL_PHRASES = ${JSON.stringify(JSON.parse(readFileSync(join(SRC, "all.json"), "utf8")).phrases)};`);
lines.push("");
lines.push("export const DEFAULT_CATEGORY = \"coding\";");
lines.push("");

writeFileSync(OUT, lines.join("\n"));

const total = index.categories.reduce((sum, entry) => sum + entry.count, 0);
console.log(`已生成 ${OUT}`);
console.log(`分类 ${index.categories.length} 个，分类内合计 ${total} 条，全量去重 ${index.all.count} 条。`);
if (!existsSync(OUT)) process.exit(1);
