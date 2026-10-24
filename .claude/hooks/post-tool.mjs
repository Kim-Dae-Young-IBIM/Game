// [5.4][6.1] PostToolUse — 편집 후 피드백 지점
// .claude/harness.json 의 checks 중 편집된 파일 확장자에 맞는 검사를 실행하고,
// 실패하면 결과를 Claude에게 전달한다. 도구는 이미 실행된 뒤라 막지 않고 피드백만 준다.
// checks가 비어 있으면 아무것도 하지 않는다. 명령 안의 {file} 은 편집된 파일 경로로 바뀐다.
//
// checks 예:
//   개발: { "name": "format", "extensions": [".cs"], "command": "dotnet format --verify-no-changes --include {file}", "localOnly": true }
//   문서: { "name": "markdown", "extensions": [".md"], "command": "npx --yes markdownlint-cli2 {file}" }
import { readFileSync } from "node:fs";
import { join, extname } from "node:path";
import { spawnSync } from "node:child_process";

function readStdin() {
  try { return JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { return {}; }
}
function loadConfig(root) {
  try { return JSON.parse(readFileSync(join(root, ".claude", "harness.json"), "utf8")); }
  catch { return {}; }
}
const tail = (s, n = 40) => String(s || "").trim().split(/\r?\n/).slice(-n).join("\n");

const input = readStdin();
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const checks = (loadConfig(root).checks || []).filter(c => c && c.command);
if (checks.length === 0) process.exit(0);

const remote = process.env.CLAUDE_CODE_REMOTE === "true";
const file = String((input.tool_input || {}).file_path || "");
const ext = extname(file).toLowerCase();

const failures = [];
for (const c of checks) {
  if (c.localOnly && remote) continue;
  const exts = (c.extensions || []).map(e => e.toLowerCase());
  if (exts.length && !exts.includes(ext)) continue;
  const cmd = c.command.replaceAll("{file}", JSON.stringify(file));
  const r = spawnSync(cmd, { cwd: root, shell: true, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) failures.push(`[${c.name || c.command}]\n${tail(`${r.stdout || ""}\n${r.stderr || ""}`)}`);
}
if (failures.length === 0) process.exit(0);

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: `편집 후 검사가 실패했습니다. 대상: ${file}\n${failures.join("\n\n")}`
  }
}));
process.exit(0);
