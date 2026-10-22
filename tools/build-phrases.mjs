#!/usr/bin/env node
// 从上游 config.example.json 生成分类文案资源。
// 只提取中文文案；含 {占位符} 的条目与带权重对象会被排除，
// 因为 Claude Code 不会替换占位符、spinnerVerbs 也只接受字符串。
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
function argOf(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const sourcePath = resolve(argOf("--source", ""));
if (!args.includes("--source")) {
  console.error("用法：node tools/build-phrases.mjs --source <上游 config.example.json> [--out <目录>]");
  process.exit(2);
}
const outDir = resolve(argOf("--out", "plugins/spinner-zh/phrases"));
const sourceText = readFileSync(sourcePath, "utf8");
const sourceSha = createHash("sha256").update(sourceText).digest("hex");
const doc = JSON.parse(sourceText);

const PLACEHOLDER = /[{}]/;
const CONTROL = /[\u0000-\u001f\u007f\u2028\u2029]/;

function textOf(item) {
  if (typeof item === "string") return item;
  if (item && typeof item === "object" && typeof item.text === "string") return item.text;
  return null;
}

const categories = [];
const excluded = [];
const seenGlobal = new Set();
const allPhrases = [];
let rawTotal = 0;

for (const pack of doc.packs ?? []) {
  const id = pack.id;
  const label = typeof pack.label === "string" ? { zh: pack.label, en: pack.label } : pack.label;
  const phrases = [];
  const seenInPack = new Set();
  let raw = 0;
  let skipped = 0;
  let duplicates = 0;
  for (const [phase, list] of Object.entries(pack.phrases?.zh ?? {})) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      raw += 1;
      rawTotal += 1;
      const text = textOf(item);
      if (text === null || text.trim() === "" || PLACEHOLDER.test(text) || CONTROL.test(text)) {
        skipped += 1;
        excluded.push({ category: id, phase, text: text ?? String(item), reason: text === null ? "not_text" : PLACEHOLDER.test(text) ? "placeholder" : "invalid" });
        continue;
      }
      // spinnerVerbs 是字符串数组，重复条目不会带来额外变化，构建时直接去掉。
      if (seenInPack.has(text)) {
        duplicates += 1;
        continue;
      }
      seenInPack.add(text);
      phrases.push(text);
      if (!seenGlobal.has(text)) {
        seenGlobal.add(text);
        allPhrases.push(text);
      }
    }
  }
  const file = `${id}.json`;
  categories.push({ id, label, count: phrases.length, raw, skipped, duplicates, file });
  writeFileSync(
    join(outDir, file),
    `${JSON.stringify({ id, label, attribution: "文案来自 01Virex/dsh-status-rotator（MIT）", phrases }, null, 2)}\n`,
  );
}

writeFileSync(
  join(outDir, "all.json"),
  `${JSON.stringify({ id: "all", label: { zh: "全部文案", en: "All categories" }, phrases: allPhrases }, null, 2)}\n`,
);

const index = {
  version: 1,
  attribution: "中文文案来自 https://github.com/01Virex/dsh-status-rotator（MIT License，见 LICENSE-UPSTREAM-MIT）。已按分类拆分，未改动文案内容。",
  source: {
    repository: "https://github.com/01Virex/dsh-status-rotator",
    file: "config.example.json",
    commit: argOf("--commit", "unknown"),
    sha256: sourceSha,
    license: "MIT",
  },
  totals: { raw: rawTotal, usable: allPhrases.length, excluded: excluded.length },
  categories,
  all: { id: "all", count: allPhrases.length, file: "all.json" },
};
writeFileSync(join(outDir, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
writeFileSync(join(outDir, "excluded.json"), `${JSON.stringify({ note: "含占位符或非字符串、未写入 spinnerVerbs 的条目", items: excluded }, null, 2)}\n`);

mkdirSync(dirname(outDir), { recursive: true });
console.log(`分类 ${categories.length} 个，原始 ${rawTotal} 条，可用 ${allPhrases.length} 条（跨分类去重后），排除 ${excluded.length} 条。`);
for (const c of categories) console.log(`  ${c.id.padEnd(15)} ${String(c.count).padStart(4)} 条  ${c.label?.zh ?? ""}`);
