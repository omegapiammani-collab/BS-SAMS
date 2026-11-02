export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const activityEvents = [
  "pointermove",
  "pointerdown",
  "keydown",
  "scroll",
  "touchstart",
];
const keyFor = (userId) => `bs-sams:idle-session:${userId}`;

// Some browsers deny storage access. Keep timing within this page in that case.
const memory = new Map();
const unavailableStorages = new WeakSet();
function browserStorage() {
  try {
    return localStorage;
  } catch {
    return null;
  }
}
function readActivity(storage, key) {
  if (storage && unavailableStorages.has(storage))
    return memory.get(key) ?? null;
  try {
    return storage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}
function writeActivity(storage, key, value) {
  memory.set(key, value);
  if (storage && unavailableStorages.has(storage)) return;
  try {
    storage.setItem(key, value);
  } catch {
    if (storage) unavailableStorages.add(storage);
    // The in-memory deadline still enforces logout in this page.
  }
}
function timestamp(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function resetIdleSession(
  userId,
  storage = browserStorage(),
  now = Date.now(),
) {
  writeActivity(storage, keyFor(userId), String(now));
}

// Share the deadline across tabs and preserve it across page reloads.
export function watchIdleSession(
  userId,
  onExpire,
  {
    target = window,
    storage = browserStorage(),
    now = Date.now,
    schedule = setTimeout,
    cancel = clearTimeout,
  } = {},
) {
  const key = keyFor(userId);
  const savedActivity = readActivity(storage, key);
  let lastActivity = timestamp(savedActivity);
  if (savedActivity !== "expired" && !lastActivity) {
    lastActivity = now();
    writeActivity(storage, key, String(lastActivity));
  }
  let timer;
  let expired = false;
  let lastWrite = lastActivity;
  function expire() {
    if (expired) return;
    expired = true;
    cancel(timer);
    writeActivity(storage, key, "expired");
    onExpire();
  }
  function check() {
    if (expired) return;
    const shared = readActivity(storage, key);
    if (shared === "expired") return expire();
    lastActivity = Math.max(lastActivity, timestamp(shared));
    const remaining = lastActivity + IDLE_TIMEOUT_MS - now();
    if (remaining <= 0) return expire();
    cancel(timer);
    timer = schedule(check, remaining);
  }
  function activity() {
    check(); // Returning after sleep must not revive an expired session.
    if (expired) return;
    lastActivity = now();
    // Avoid synchronous storage writes on every pointer movement.
    if (lastActivity - lastWrite >= 1000) {
      writeActivity(storage, key, String(lastActivity));
      lastWrite = lastActivity;
    }
  }
  function flush() {
    const shared = readActivity(storage, key);
    if (!expired && shared !== "expired")
      writeActivity(
        storage,
        key,
        String(Math.max(lastActivity, timestamp(shared))),
      );
  }
  function changed(event) {
    if (event.key === key) check();
  }
  for (const event of activityEvents)
    target.addEventListener(event, activity, { capture: true, passive: true });
  target.addEventListener("focus", check);
  target.addEventListener("pageshow", check);
  target.addEventListener("visibilitychange", check);
  target.addEventListener("pagehide", flush);
  target.addEventListener("storage", changed);
  check();
  return () => {
    cancel(timer);
    for (const event of activityEvents)
      target.removeEventListener(event, activity, { capture: true });
    target.removeEventListener("focus", check);
    target.removeEventListener("pageshow", check);
    target.removeEventListener("visibilitychange", check);
    target.removeEventListener("pagehide", flush);
    target.removeEventListener("storage", changed);
  };
}
