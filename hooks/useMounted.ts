"use client";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** True after hydration; use to avoid wallet-state SSR mismatches. */
export function useMounted(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
