"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type MenuSearchValue = {
  search: string;
  setSearch: (v: string) => void;
};

const MenuSearchContext = createContext<MenuSearchValue | null>(null);

export function MenuSearchProvider({ children }: { children: ReactNode }) {
  const [search, setSearch] = useState("");
  const value = useMemo(() => ({ search, setSearch }), [search]);
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
