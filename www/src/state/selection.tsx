import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type SelectionContextValue = {
  selectedIds: Set<string>;
  setSelectedIds: (ids: Iterable<string>) => void;
  clearSelected: () => void;
  hasSelection: boolean;
};

const SelectionContext = createContext<SelectionContextValue | undefined>(undefined);

export const SelectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selected, setSelected] = useState<Set<string>>(() => {
    try {
      if (typeof window === 'undefined') return new Set();
      const raw = window.localStorage.getItem('selectedIds');
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr.map((x) => String(x)));
    } catch { /* ignore */ }
    return new Set();
  });

  // persist on change
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('selectedIds', JSON.stringify(Array.from(selected)));
      }
    } catch { /* ignore */ }
  }, [selected]);

  const value = useMemo<SelectionContextValue>(() => ({
    selectedIds: selected,
    hasSelection: selected.size > 0,
    setSelectedIds: (ids: Iterable<string>) => {
      const next = new Set<string>();
      for (const id of ids) next.add(String(id));
      setSelected(next);
    },
    clearSelected: () => setSelected(new Set()),
  }), [selected]);

  return (
    <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>
  );
};

export function useSelection() {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error("useSelection must be used within a SelectionProvider");
  return ctx;
}
