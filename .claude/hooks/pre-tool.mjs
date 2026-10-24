// [5.1] PreToolUse — 실행 전 차단 지점
// .claude/harness.json 의 forbidden 규칙에 걸리면 exit 2로 편집을 막는다.
// 규칙이 비어 있으면 아무것도 막지 않는다(exit 0).
//
// forbidden 규칙 예:
//   { "pattern": "TaskDialog\\.Show", "flags": "", "extensions": [".cs"],
//     "message": "UI 대화상자 대신 로그를 쓰세요." }
import { readFileSync } from "node:fs";
import { join, extname } from "node:path";

function readStdin() {
  try { return JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { return {}; }
}
function loadConfig(root) {
  try { return JSON.parse(readFileSync(join(root, ".claude", "harness.json"), "utf8")); }
  catch { return {}; }
}

const input = readStdin();
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const rules = (loadConfig(root).forbidden || []).filter(r => r && r.pattern);
if (rules.length === 0) process.exit(0);

const ti = input.tool_input || {};
const file = String(ti.file_path || "");
const ext = extname(file).toLowerCase();
const text = [ti.content, ti.new_string].filter(v => typeof v === "string").join("\n");
if (!text) process.exit(0);

const hits = [];
for (const r of rules) {
  const exts = (r.extensions || []).map(e => e.toLowerCase());
  if (exts.length && !exts.includes(ext)) continue;
  let re;
  try { re = new RegExp(r.pattern, r.flags || ""); }
  catch { process.stderr.write(`harness.json 규칙 패턴 오류: ${r.pattern}\n`); continue; }
  if (re.test(text)) hits.push(`- ${r.message || "금지 패턴"} (패턴: ${r.pattern})`);
}

if (hits.length) {
  process.stderr.write(`하네스 정책 위반으로 ${file} 편집을 막았습니다.\n${hits.join("\n")}\n규칙 위치: .claude/harness.json\n`);
  process.exit(2);
}
process.exit(0);
