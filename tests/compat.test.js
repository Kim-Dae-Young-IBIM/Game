// 빌드 결과물이 Chromium 79(webOS 6.5)에서 문법 오류 없이 돌아가는지 검사한다.
// dist/가 없으면(빌드 전) 건너뛴다. 완료 검증은 "npm run build && npm test" 순서라 항상 검사된다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseSync } from "vite";

const distAssets = fileURLToPath(new URL("../dist/assets/", import.meta.url));

// Chromium 80 이상에서만 되는 문법 → 발견 이름
function unsupported(node) {
  switch (node.type) {
    case "ChainExpression":
      return "옵셔널 체이닝 ?. (Chrome 80)";
    case "LogicalExpression":
      return node.operator === "??" ? "널 병합 ?? (Chrome 80)" : null;
    case "AssignmentExpression":
      return ["||=", "&&=", "??="].includes(node.operator) ? `논리 할당 ${node.operator} (Chrome 85)` : null;
    case "StaticBlock":
      return "클래스 static 블록 (Chrome 94)";
    case "MethodDefinition":
      return node.key && node.key.type === "PrivateIdentifier" ? "private 메서드 #m() (Chrome 84)" : null;
    case "BinaryExpression":
      return node.operator === "in" && node.left && node.left.type === "PrivateIdentifier" ? "#x in obj (Chrome 91)" : null;
    case "AwaitExpression":
      return null; // 함수 안의 await는 OK. 최상위 await는 아래에서 따로 본다.
    default:
      return null;
  }
}

function walk(node, found) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) walk(n, found);
    return;
  }
  if (typeof node.type === "string") {
    const why = unsupported(node);
    if (why) found.add(why);
  }
  for (const key in node) {
    if (key === "parent") continue;
    const v = node[key];
    if (v && typeof v === "object") walk(v, found);
  }
}

// 함수 밖의 await(최상위 await, Chrome 89)를 찾는다. 함수 안으로는 내려가지 않는다.
const FUNCTION_TYPES = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);
function hasTopLevelAwait(node) {
  if (!node || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some(hasTopLevelAwait);
  if (FUNCTION_TYPES.has(node.type)) return false;
  if (node.type === "AwaitExpression" || (node.type === "ForOfStatement" && node.await)) return true;
  for (const key in node) {
    if (key === "parent") continue;
    const v = node[key];
    if (v && typeof v === "object" && hasTopLevelAwait(v)) return true;
  }
  return false;
}

const files = existsSync(distAssets) ? readdirSync(distAssets).filter(f => f.endsWith(".js")) : [];

test("빌드 JS에 Chromium 79 미지원 문법이 없다", { skip: files.length === 0 && "dist 없음(빌드 전)" }, () => {
  for (const f of files) {
    const code = readFileSync(distAssets + f, "utf8");
    const result = parseSync(f, code, { sourceType: "module" });
    assert.equal(result.errors.length, 0, `${f} 파싱 오류`);
    const found = new Set();
    walk(result.program, found);
    if (hasTopLevelAwait(result.program)) found.add("최상위 await (Chrome 89)");
    assert.deepEqual([...found], [], `${f}: ${[...found].join(", ")}`);
  }
});

test("검사기 자체 확인: 미지원 문법을 실제로 잡아낸다", () => {
  const code = "a?.b; x ?? y; z ||= 1; class C { #m(){} static { } }";
  const found = new Set();
  walk(parseSync("t.js", code, { sourceType: "module" }).program, found);
  assert.equal(found.size, 5, [...found].join(", "));
  const parse = c => parseSync("t.js", c, { sourceType: "module" }).program;
  assert.equal(hasTopLevelAwait(parse("const x = await f();")), true);
  assert.equal(hasTopLevelAwait(parse("for await (const a of b) {}")), true);
  assert.equal(hasTopLevelAwait(parse("async function g() { const x = await f(); }")), false);
  assert.equal(hasTopLevelAwait(parse("const h = async () => { await f(); };")), false);
});
