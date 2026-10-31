import { useEffect } from "react";

// Warn while edits are uncommitted, even when a private server draft exists.
export function useUnsavedChanges(dirty) {
  useEffect(() => {
    if (!dirty) return;
    const preventLeave = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventLeave);
    return () => window.removeEventListener("beforeunload", preventLeave);
  }, [dirty]);
}
