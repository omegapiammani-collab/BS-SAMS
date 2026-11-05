import test from "node:test";
import assert from "node:assert/strict";
import {
  IDLE_TIMEOUT_MS,
  endIdleSession,
  resetIdleSession,
  watchIdleSession,
} from "../src/idle-session.js";

function setup() {
  let time = 10000;
  let expirations = 0;
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const target = new EventTarget();
  const timers = new Map();
  let nextTimer = 0;
  const options = {
    target,
    storage,
    now: () => time,
    schedule: (fn, delay) => {
      const id = ++nextTimer;
      timers.set(id, { fn, at: time + delay });
      return id;
    },
    cancel: (id) => timers.delete(id),
  };
  return {
    storage,
    target,
    options,
    start: () => watchIdleSession(1, () => expirations++, options),
    advance(ms, runTimers = true) {
      time += ms;
      if (runTimers) {
        for (const [id, timer] of [...timers]) {
          if (timer.at <= time) {
            timers.delete(id);
            timer.fn();
          }
        }
      }
    },
    get expirations() {
      return expirations;
    },
    get time() {
      return time;
    },
    get timers() {
      return timers.size;
    },
  };
}

test("expires once at exactly 30 minutes with no activity", () => {
  const s = setup();
  s.start();
  s.advance(IDLE_TIMEOUT_MS - 1);
  assert.equal(s.expirations, 0);
  s.advance(1);
  s.target.dispatchEvent(new Event("focus"));
  assert.equal(s.expirations, 1);
});

for (const event of [
  "pointermove",
  "pointerdown",
  "keydown",
  "scroll",
  "touchstart",
]) {
  test(`${event} extends the deadline`, () => {
    const s = setup();
    s.start();
    s.advance(20 * 60 * 1000);
    s.target.dispatchEvent(new Event(event));
    s.advance(10 * 60 * 1000);
    assert.equal(s.expirations, 0);
    s.advance(20 * 60 * 1000);
    assert.equal(s.expirations, 1);
  });
}

test("reload preserves deadline and fresh login resets it", () => {
  const s = setup();
  const stop = s.start();
  s.advance(20 * 60 * 1000);
  stop();
  s.start();
  s.advance(10 * 60 * 1000);
  assert.equal(s.expirations, 1);
  resetIdleSession(1, s.storage, s.time);
  s.start();
  s.advance(IDLE_TIMEOUT_MS - 1);
  assert.equal(s.expirations, 1);
});

test("interaction after sleep expires instead of extending session", () => {
  const s = setup();
  s.start();
  s.advance(IDLE_TIMEOUT_MS, false);
  s.target.dispatchEvent(new Event("keydown"));
  assert.equal(s.expirations, 1);
});

test("another tab's activity extends deadline and expiry signs out this tab", () => {
  const s = setup();
  s.start();
  s.advance(20 * 60 * 1000);
  resetIdleSession(1, s.storage, s.time);
  s.advance(10 * 60 * 1000);
  assert.equal(s.expirations, 0);
  s.storage.setItem("bs-sams:idle-session:1", "expired");
  const event = new Event("storage");
  event.key = "bs-sams:idle-session:1";
  s.target.dispatchEvent(event);
  assert.equal(s.expirations, 1);
});

test("cleanup removes timers and activity listeners", () => {
  const s = setup();
  const stop = s.start();
  stop();
  assert.equal(s.timers, 0);
  s.advance(IDLE_TIMEOUT_MS);
  s.target.dispatchEvent(new Event("keydown"));
  assert.equal(s.expirations, 0);
  assert.equal(s.timers, 0);
});

test("expired session stays expired after a reload", () => {
  const s = setup();
  s.storage.setItem("bs-sams:idle-session:1", "expired");
  s.start();
  assert.equal(s.expirations, 1);
});

test("blocked browser storage does not break login or idle expiry", () => {
  const s = setup();
  const blocked = {
    getItem() {
      throw new Error("Storage disabled");
    },
    setItem() {
      throw new Error("Storage disabled");
    },
  };
  assert.doesNotThrow(() => resetIdleSession("blocked", blocked, s.time));
  let expired = false;
  const stop = watchIdleSession(
    "blocked",
    () => {
      expired = true;
    },
    { ...s.options, storage: blocked },
  );
  s.advance(IDLE_TIMEOUT_MS);
  assert.equal(expired, true);
  stop();
});

test("non-finite stored timestamps cannot disable expiry", () => {
  const s = setup();
  s.storage.setItem("bs-sams:idle-session:1", "Infinity");
  s.start();
  s.advance(IDLE_TIMEOUT_MS);
  assert.equal(s.expirations, 1);
});

test("write-only storage failures do not restore an old expired marker", () => {
  const s = setup();
  const full = {
    getItem() {
      return "expired";
    },
    setItem() {
      throw new Error("Quota exceeded");
    },
  };
  resetIdleSession("quota", full, s.time);
  let expired = false;
  watchIdleSession(
    "quota",
    () => {
      expired = true;
    },
    { ...s.options, storage: full },
  );
  assert.equal(expired, false);
  s.advance(IDLE_TIMEOUT_MS);
  assert.equal(expired, true);
});

test("manual logout marks the shared session expired for other tabs and reloads", () => {
  const s = setup();
  s.start();
  endIdleSession(1, s.storage);
  const event = new Event("storage");
  event.key = "bs-sams:idle-session:1";
  s.target.dispatchEvent(event);
  assert.equal(s.expirations, 1);
  s.start();
  assert.equal(s.expirations, 2);
});
