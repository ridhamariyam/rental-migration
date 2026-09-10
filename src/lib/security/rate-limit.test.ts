/**
 * RQ-14 regression: the login limiter must not be bypassable with a
 * header, must not grow without bound, and must count per account as well
 * as per IP.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  MemoryRateLimitStore,
  checkRateLimit,
  clearRateLimit,
  clientIpFromHeaders,
} from "@/lib/security/rate-limit";

test("the client cannot forge its way to a fresh bucket", () => {
  // A caller prepending `X-Forwarded-For: 9.9.9.9` reaches the app as
  // "9.9.9.9, <real client>" once the platform appends its observation.
  assert.equal(
    clientIpFromHeaders("9.9.9.9, 203.0.113.7", 1),
    "203.0.113.7",
    "the trusted proxy's observation wins over the client's claim",
  );

  // Every forged prefix maps to the same real address, so rotating it
  // does not buy a new window.
  const forged = ["1.1.1.1", "2.2.2.2", "3.3.3.3"].map((fake) =>
    clientIpFromHeaders(`${fake}, 203.0.113.7`, 1),
  );
  assert.deepEqual(new Set(forged), new Set(["203.0.113.7"]));
});

test("a plain single-hop header still resolves", () => {
  assert.equal(clientIpFromHeaders("203.0.113.7", 1), "203.0.113.7");
  assert.equal(clientIpFromHeaders(null, 1), "unknown");
  assert.equal(clientIpFromHeaders("", 1), "unknown");
});

test("two trusted hops read one further back", () => {
  assert.equal(
    clientIpFromHeaders("9.9.9.9, 203.0.113.7, 10.0.0.1", 2),
    "203.0.113.7",
  );
});

test("attempts are refused once the limit is passed", () => {
  const store = new MemoryRateLimitStore();
  const now = 1_000_000;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = checkRateLimit("k", 3, 60, store, now);
    assert.equal(result.allowed, true, `attempt ${attempt} should be allowed`);
  }

  const blocked = checkRateLimit("k", 3, 60, store, now);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0, "the caller is told when to come back");
});

test("the window reopens once it has elapsed", () => {
  const store = new MemoryRateLimitStore();
  const start = 1_000_000;

  checkRateLimit("k", 1, 60, store, start);
  assert.equal(checkRateLimit("k", 1, 60, store, start).allowed, false);
  assert.equal(
    checkRateLimit("k", 1, 60, store, start + 61_000).allowed,
    true,
    "a fresh window after the old one expired",
  );
});

test("a successful sign-in clears the caller's counter", () => {
  const store = new MemoryRateLimitStore();
  const now = 1_000_000;

  checkRateLimit("k", 1, 60, store, now);
  assert.equal(checkRateLimit("k", 1, 60, store, now).allowed, false);

  clearRateLimit("k", store);
  assert.equal(
    checkRateLimit("k", 1, 60, store, now).allowed,
    true,
    "mistyping a password twice should not linger after a success",
  );
});

test("the store does not grow without bound", () => {
  const store = new MemoryRateLimitStore();
  const start = 1_000_000;

  // An attacker cycling 500 distinct keys.
  for (let i = 0; i < 500; i += 1) {
    checkRateLimit(`key-${i}`, 10, 60, store, start);
  }
  assert.equal(store.size(), 500);

  // Well past both the window and the sweep interval, the next write
  // collects everything expired instead of keeping it forever.
  checkRateLimit("later", 10, 60, store, start + 10 * 60_000);
  assert.ok(
    store.size() <= 2,
    `expected the expired windows to be swept, still holding ${store.size()}`,
  );
});

test("separate keys are counted separately", () => {
  const store = new MemoryRateLimitStore();
  const now = 1_000_000;

  checkRateLimit("ip:1.1.1.1", 1, 60, store, now);
  assert.equal(checkRateLimit("ip:1.1.1.1", 1, 60, store, now).allowed, false);
  assert.equal(
    checkRateLimit("account:someone@example.com", 1, 60, store, now).allowed,
    true,
    "an account bucket is independent of an IP bucket",
  );
});
