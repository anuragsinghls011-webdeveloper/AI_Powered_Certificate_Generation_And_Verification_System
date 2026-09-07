import { useCallback, useRef, useState } from 'react';

const LIMIT = 60;
const COALESCE_MS = 500;

/**
 * Undo/redo for the template being edited.
 *
 * Three ways to change state, so that one user gesture becomes one history step:
 *   commit(updater)              discrete action (add, delete, align, reorder…)
 *   snapshot() then replace(...) continuous gesture — snapshot on pointer-down,
 *                                replace for every move event
 *   tweak(key, updater)          slider / text streams, coalesced per key
 */
export default function useHistory(initial) {
  const [state, setState] = useState({ past: [], present: initial, future: [] });
  const coalesce = useRef({ key: null, at: 0 });

  const apply = (present, updater) => (typeof updater === 'function' ? updater(present) : updater);

  const reset = useCallback((next) => {
    coalesce.current = { key: null, at: 0 };
    setState({ past: [], present: next, future: [] });
  }, []);

  const replace = useCallback((updater) => {
    setState((s) => ({ ...s, present: apply(s.present, updater) }));
  }, []);

  const commit = useCallback((updater) => {
    coalesce.current = { key: null, at: 0 };
    setState((s) => {
      const next = apply(s.present, updater);
      if (next === s.present) return s;
      return { past: [...s.past, s.present].slice(-LIMIT), present: next, future: [] };
    });
  }, []);

  /** Records the current state as an undo point without changing it. */
  const snapshot = useCallback(() => {
    coalesce.current = { key: null, at: 0 };
    setState((s) => ({ past: [...s.past, s.present].slice(-LIMIT), present: s.present, future: [] }));
  }, []);

  const tweak = useCallback((key, updater) => {
    const now = Date.now();
    const prev = coalesce.current;
    const isNewGesture = prev.key !== key || now - prev.at > COALESCE_MS;
    coalesce.current = { key, at: now };
    setState((s) => {
      const next = apply(s.present, updater);
      if (next === s.present) return s;
      if (!isNewGesture) return { ...s, present: next, future: [] };
      return { past: [...s.past, s.present].slice(-LIMIT), present: next, future: [] };
    });
  }, []);

  const undo = useCallback(() => {
    coalesce.current = { key: null, at: 0 };
    setState((s) => {
      if (!s.past.length) return s;
      const past = s.past.slice(0, -1);
      const present = s.past[s.past.length - 1];
      return { past, present, future: [s.present, ...s.future].slice(0, LIMIT) };
    });
  }, []);

  const redo = useCallback(() => {
    coalesce.current = { key: null, at: 0 };
    setState((s) => {
      if (!s.future.length) return s;
      const [present, ...future] = s.future;
      return { past: [...s.past, s.present].slice(-LIMIT), present, future };
    });
  }, []);

  return {
    present: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    depth: state.past.length,
    reset,
    replace,
    commit,
    snapshot,
    tweak,
    undo,
    redo
  };
}
