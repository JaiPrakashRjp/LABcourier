"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

/** What a package is: dental lab work (lab → dentists) or an asset (sender → lab). */
export type Category = "DENTAL" | "ASSET";

export const CATEGORY_LABELS: Record<Category, string> = { DENTAL: "Dental Lab Work", ASSET: "Assets" };

const KEY = "labdrop:category";
const CategoryContext = createContext<{ category: Category; setCategory: (c: Category) => void }>({
  category: "DENTAL",
  setCategory: () => {},
});

/** Remembers the Shipping choice in the side menu (only in this browser). */
export function CategoryProvider({ children }: { children: React.ReactNode }) {
  const [category, set] = useState<Category>("DENTAL");

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "ASSET") set("ASSET");
    } catch {
      /* storage blocked: start with dental lab work */
    }
  }, []);

  const setCategory = useCallback((c: Category) => {
    set(c);
    try {
      localStorage.setItem(KEY, c);
    } catch {
      /* not saved; still works for this visit */
    }
  }, []);

  return <CategoryContext.Provider value={{ category, setCategory }}>{children}</CategoryContext.Provider>;
}

export const useCategory = () => useContext(CategoryContext);
