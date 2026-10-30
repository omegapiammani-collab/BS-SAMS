import { NavigationGuardContext } from "./navigation-guard";
import { useEffect, useContext, useId } from "react";

// Keep drafts in memory only. Never persist social-welfare data in browser storage.
export function useUnsavedChanges(dirty) {
  const guard = useContext(NavigationGuardContext);
  const id = useId();
  const block = guard?.block;
  useEffect(() => block?.(id, dirty), [block, id, dirty]);
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
