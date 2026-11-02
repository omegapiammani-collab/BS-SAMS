export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const activityEvents = [
  "pointermove",
  "pointerdown",
  "keydown",
  "scroll",
  "touchstart",
];
const keyFor = (userId) => `bs-sams:idle-session:${userId}`;

export function resetIdleSession(
  userId,
  storage = localStorage,
  now = Date.now(),
) {
  storage.setItem(keyFor(userId), String(now));
}

// Share the deadline across tabs and preserve it across page reloads.
export function watchIdleSession(
  userId,
  onExpire,
  {
    target = window,
    storage = localStorage,
    now = Date.now,
    schedule = setTimeout,
    cancel = clearTimeout,
  } = {},
) {
  const key = keyFor(userId);
  const savedActivity = storage.getItem(key);
  let lastActivity = Number(savedActivity);
  if (savedActivity !== "expired" && !lastActivity) {
    lastActivity = now();
    storage.setItem(key, String(lastActivity));
  }
  let timer;
  let expired = false;
  let lastWrite = lastActivity;
  function expire() {
    if (expired) return;
    expired = true;
    cancel(timer);
    storage.setItem(key, "expired");
    onExpire();
  }
  function check() {
    if (expired) return;
    const shared = storage.getItem(key);
    if (shared === "expired") return expire();
    lastActivity = Math.max(lastActivity, Number(shared) || 0);
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
      storage.setItem(key, String(lastActivity));
      lastWrite = lastActivity;
    }
  }
  function flush() {
    const shared = storage.getItem(key);
    if (!expired && shared !== "expired")
      storage.setItem(key, String(Math.max(lastActivity, Number(shared) || 0)));
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
