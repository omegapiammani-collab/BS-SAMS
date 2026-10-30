import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ConfirmDialog } from "./ui";
export const NavigationGuardContext = createContext(null);
export function NavigationGuardProvider({ children }) {
  const blockers = useRef(new Set());
  const [pending, setPending] = useState(null);
  useEffect(() => {
    const cancel = () => setPending(null);
    window.addEventListener("session-expired", cancel);
    return () => window.removeEventListener("session-expired", cancel);
  }, []);
  const block = useCallback((id, dirty) => {
    if (dirty) blockers.current.add(id);
    else blockers.current.delete(id);
    return () => blockers.current.delete(id);
  }, []);
  const request = useCallback((action) => {
    if (blockers.current.size) setPending({ action });
    else action();
  }, []);
  const value = useMemo(() => ({ block, request }), [block, request]);
  return (
    <NavigationGuardContext.Provider value={value}>
      {children}
      {pending && (
        <ConfirmDialog
          title="ยังมีข้อมูลที่ไม่ได้บันทึก"
          description="การเปลี่ยนเมนูหรือออกจากระบบจะละทิ้งข้อมูลที่แก้ไขและยังไม่บันทึก ต้องการดำเนินการต่อหรือไม่?"
          confirmText="ละทิ้งและดำเนินการต่อ"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const action = pending.action;
            setPending(null);
            action();
          }}
        />
      )}
    </NavigationGuardContext.Provider>
  );
}
export function useGuardedNavigation() {
  const guard = useContext(NavigationGuardContext);
  return guard.request;
}
