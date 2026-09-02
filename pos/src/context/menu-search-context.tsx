"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

type MenuSearchValue = {
  search: string;
  setSearch: (v: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  focusSearch: () => void;
};

const MenuSearchContext = createContext<MenuSearchValue | null>(null);

export function MenuSearchProvider({ children }: { children: ReactNode }) {
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const focusSearch = useCallback(() => {
    const el = searchInputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);
  const value = useMemo(
    () => ({ search, setSearch, searchInputRef, focusSearch }),
    [search, focusSearch],
  );
  return (
    <MenuSearchContext.Provider value={value}>
      {children}
    </MenuSearchContext.Provider>
  );
}

export function useMenuSearch() {
  const ctx = useContext(MenuSearchContext);
  if (!ctx) {
    throw new Error("useMenuSearch must be used within MenuSearchProvider");
  }
  return ctx;
}
