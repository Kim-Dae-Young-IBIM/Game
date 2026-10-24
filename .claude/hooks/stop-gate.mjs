// [6.3][8.1] Stop — 완료 관문
// .claude/harness.json 의 verify.command 가 실패하면 exit 2로 Claude가 멈추지 않고 계속 고치게 한다.
// - command가 비어 있으면 통과한다.
// - localOnly가 true이고 클라우드 세션(CLAUDE_CODE_REMOTE=true)이면 통과한다. (예: Revit API 빌드)
// - 같은 세션에서 maxRetries번 연속 실패하면 더 붙잡지 않고 사용자에게 알린 뒤 통과한다.
//
// verify 예:
//   개발: "dotnet build src/App.sln -c Debug"          (localOnly: true)
//   문서: "node scripts/check-sections.mjs report.md"   (필수 목차 확인 스크립트)
//   분석: "python -m pytest tests -q"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

function readStdin() {
  try { return JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { return {}; }
}
function loadConfig(root) {
  try { return JSON.parse(readFileSync(join(root, ".claude", "harness.json"), "utf8")); }
  catch { return {}; }
}
const tail = (s, n = 60) => String(s || "").trim().split(/\r?\n/).slice(-n).join("\n");

const input = readStdin();
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const cfg = loadConfig(root).verify || {};
if (!cfg.command) process.exit(0);
if (cfg.localOnly && process.env.CLAUDE_CODE_REMOTE === "true") process.exit(0);

const maxRetries = Number.isInteger(cfg.maxRetries) ? cfg.maxRetries : 3;
const dir = join(tmpdir(), "ibim-harness");
const counter = join(dir, `stop-${String(input.session_id || "nosession").replace(/[^\w-]/g, "")}.txt`);
const readCount = () => { try { return parseInt(readFileSync(counter, "utf8"), 10) || 0; } catch { return 0; } };
const writeCount = n => { try { mkdirSync(dir, { recursive: true }); writeFileSync(counter, String(n)); } catch {} };

const r = spawnSync(cfg.command, { cwd: root, shell: true, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
if (r.status === 0) { writeCount(0); process.exit(0); }

const count = readCount() + 1;
writeCount(count);
const out = tail(`${r.stdout || ""}\n${r.stderr || ""}`);

if (count > maxRetries) {
  writeCount(0);
  process.stdout.write(JSON.stringify({
    systemMessage: `완료 검증이 ${maxRetries}회 연속 실패해 관문을 해제했습니다. 직접 확인이 필요합니다: ${cfg.command}`
  }));
  process.exit(0);
}

process.stderr.write(`완료 검증 실패로 작업을 끝낼 수 없습니다 (${count}/${maxRetries}). 문제를 고친 뒤 다시 완료하세요.\n명령: ${cfg.command}\n${out}\n`);
process.exit(2);
