import { useEffect, useRef, type MutableRefObject } from "react";

export type ScrollPosition = {
  left: number;
  top: number;
};

export type ScrollMemory = MutableRefObject<Record<string, ScrollPosition>>;

export function useScrollMemory<T extends HTMLElement>(key: string, memory: ScrollMemory) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const saved = memory.current[key];
    if (saved) {
      requestAnimationFrame(() => {
        element.scrollTop = saved.top;
        element.scrollLeft = saved.left;
      });
    }

    const save = () => {
      memory.current[key] = {
        left: element.scrollLeft,
        top: element.scrollTop
      };
    };

    element.addEventListener("scroll", save, { passive: true });
    return () => {
      save();
      element.removeEventListener("scroll", save);
    };
  }, [key, memory]);

  return ref;
}
