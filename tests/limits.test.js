import { test } from "node:test";
import assert from "node:assert/strict";
import { createFailLimiter, clientIp } from "../server/limits.js";

test("IP당 실패 횟수가 넘으면 막고, 시간이 지나면 풀린다", () => {
  let t = 0;
  const lim = createFailLimiter({ max: 3, windowMs: 1000, now: () => t });
  for (let i = 0; i < 3; i++) {
    assert.equal(lim.blocked("a"), false);
    lim.fail("a");
  }
  assert.equal(lim.blocked("a"), true);
  assert.equal(lim.blocked("b"), false, "다른 IP는 영향 없음");
  t = 1000;
  assert.equal(lim.blocked("a"), false);
});

test("프록시 뒤 실제 IP는 x-forwarded-for 첫 주소", () => {
  assert.equal(clientIp({ headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" }, address: "10.0.0.1" }), "1.2.3.4");
  assert.equal(clientIp({ headers: {}, address: "::1" }), "::1");
  assert.equal(clientIp(undefined), "?");
});
