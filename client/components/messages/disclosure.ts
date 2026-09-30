import { useCallback, useState } from "preact/hooks";

type Disclosure = { value: boolean; touched: boolean };

// Survives remounts (session switches, list rebuilds) so a row keeps the expansion the user chose.
const cache = new Map<string, Disclosure>();

function read(key: string, fallback: boolean): Disclosure {
  let state = cache.get(key);
  if (!state) {
    state = { value: fallback, touched: false };
    cache.set(key, state);
  }
  return state;
}

type SetOptions = { touched?: boolean; respectUser?: boolean };

/** Expanded/collapsed state cached by `key`. `respectUser` writes (auto-expand/collapse) are ignored once the user toggled it. */
export function useDisclosure(key: string, fallback: boolean) {
  const [, rerender] = useState(0);
  const state = read(key, fallback);
  const set = useCallback(
    (next: boolean, options?: SetOptions) => {
      const prev = read(key, fallback);
      if (options?.respectUser && prev.touched) return;
      cache.set(key, { value: next, touched: prev.touched || (options?.touched ?? true) });
      rerender(n => n + 1);
    },
    [key, fallback],
  );
  return [state.value, set] as const;
}
