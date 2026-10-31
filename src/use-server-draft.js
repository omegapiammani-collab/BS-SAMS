import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
export function useServerDraft({
  person,
  data,
  dirty,
  readonly,
  recovery,
  ownerId,
}) {
  const id = useRef(recovery?.id || crypto.randomUUID());
  const version = useRef(recovery?.version || 0);
  const queue = useRef(Promise.resolve());
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const paused = useRef(false);
  const [status, setStatus] = useState(
    recovery
      ? { state: "saved", updatedAt: recovery.updatedAt }
      : { state: "idle" },
  );
  const latest = useRef(data);
  latest.current = data;
  const changed = useRef(dirty);
  changed.current = dirty;
  function persist(value) {
    const task = queue.current.then(async () => {
      if (!active.current) return;
      setStatus({ state: "saving" });
      let saved;
      try {
        saved = await api("/drafts/" + id.current, "PUT", {
          ownerId,
          version: version.current,
          data: value,
        });
      } catch (error) {
        if (error.status !== 410) throw error;
        id.current = crypto.randomUUID();
        version.current = 0;
        saved = await api("/drafts/" + id.current, "PUT", {
          ownerId,
          version: 0,
          data: value,
        });
      }
      version.current = saved.version;
      setStatus({
        state: "saved",
        updatedAt: saved.updatedAt,
        expiresAt: saved.expiresAt,
      });
    });
    queue.current = task.catch((error) => {
      setStatus({ state: "error", message: error.message });
    });
    return task;
  }
  useEffect(() => {
    if (readonly || !dirty) return;
    const timer = setTimeout(() => {
      if (active.current && !paused.current) persist(data).catch(() => {});
    }, 1200);
    return () => clearTimeout(timer);
  }, [data, dirty, readonly]);
  useEffect(() => {
    const hide = () => {
      if (
        document.visibilityState === "hidden" &&
        changed.current &&
        !readonly &&
        active.current &&
        !paused.current
      )
        persist(latest.current).catch(() => {});
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, [readonly]);
  async function flush() {
    if (!readonly && dirty) await persist(latest.current);
    else await queue.current;
    return version.current
      ? { id: id.current, version: version.current }
      : null;
  }
  async function discard() {
    active.current = false;
    await queue.current;
    if (version.current)
      try {
        await api("/drafts/" + id.current, "DELETE", {
          version: version.current,
        });
      } catch (error) {
        active.current = true;
        throw error;
      }
  }
  function finish() {
    active.current = false;
  }
  return {
    status,
    flush,
    discard,
    finish,
    pause: () => {
      paused.current = true;
    },
    resume: () => {
      paused.current = false;
    },
  };
}
