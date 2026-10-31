import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
export function useServerDraft({ data, dirty, readonly, recovery, ownerId }) {
  const id = useRef(recovery?.id || crypto.randomUUID());
  const version = useRef(recovery?.version || 0);
  const queue = useRef(Promise.resolve());
  const unconfirmed = useRef(null);
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
  async function send(payload) {
    unconfirmed.current = payload;
    let saved;
    try {
      saved = await api("/drafts/" + id.current, "PUT", payload);
    } catch (error) {
      // Network errors and server failures can occur after the write committed.
      if (error.status && error.status < 500) unconfirmed.current = null;
      throw error;
    }
    unconfirmed.current = null;
    version.current = saved.version;
    return saved;
  }
  function persist(value) {
    const task = queue.current.then(async () => {
      if (!active.current) return;
      setStatus({ state: "saving" });
      let saved;
      try {
        if (unconfirmed.current) await send(unconfirmed.current);
        saved = await send({
          ownerId,
          version: version.current,
          data: value,
        });
      } catch (error) {
        if (error.status !== 410) throw error;
        id.current = crypto.randomUUID();
        version.current = 0;
        saved = await send({
          ownerId,
          version: 0,
          data: value,
        });
      }
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
    if (readonly || (!dirty && !version.current && !unconfirmed.current))
      return;
    const timer = setTimeout(() => {
      if (active.current && !paused.current) persist(data).catch(() => {});
    }, 1200);
    return () => clearTimeout(timer);
  }, [data, dirty, readonly]);
  useEffect(() => {
    const hide = () => {
      if (
        document.visibilityState === "hidden" &&
        (changed.current || version.current || unconfirmed.current) &&
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
    if (!readonly && (dirty || version.current || unconfirmed.current))
      await persist(latest.current);
    else await queue.current;
    return version.current
      ? { id: id.current, version: version.current }
      : null;
  }
  async function discard() {
    active.current = false;
    try {
      await queue.current;
      if (unconfirmed.current) {
        try {
          await send(unconfirmed.current);
        } catch (error) {
          if (error.status !== 410) throw error;
        }
      }
      if (version.current)
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
