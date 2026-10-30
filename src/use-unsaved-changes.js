import { useEffect } from "react";

// Keep drafts in memory only. Never persist social-welfare data in browser storage.
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
