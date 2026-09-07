import { useEffect, useRef } from 'react';

const isTypingTarget = (el) => {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

/**
 * Binds the studio's keyboard shortcuts. Every handler is optional; the hook
 * stays inert while the user is typing in a form control.
 *
 * Handlers are read through a ref so the listener is bound once, not on every
 * render of the container.
 */
export default function useStudioKeys(handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKeyDown = (e) => {
      const h = ref.current || {};
      if (isTypingTarget(e.target)) {
        if (e.key === 'Escape' && e.target.blur) e.target.blur();
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      const key = e.key;
      const lower = typeof key === 'string' ? key.toLowerCase() : '';
      const run = (fn, ...args) => {
        if (typeof fn !== 'function') return;
        e.preventDefault();
        fn(...args);
      };

      if (mod && lower === 'z') return run(e.shiftKey ? h.redo : h.undo);
      if (mod && lower === 'y') return run(h.redo);
      if (mod && lower === 's') return run(h.save);
      if (mod && lower === 'd') return run(h.duplicate);
      if (mod && lower === 'c') return run(h.copy);
      if (mod && lower === 'v') return run(h.paste);
      if (mod && lower === 'a') return run(h.selectAll);
      if (mod && (key === '0')) return run(h.zoomFit);
      if (mod && (key === '=' || key === '+')) return run(h.zoomIn);
      if (mod && key === '-') return run(h.zoomOut);
      if (mod) return; // leave every other browser shortcut alone

      if (key === 'Delete' || key === 'Backspace') return run(h.remove);
      if (key === 'Escape') return run(h.escape);
      if (key === '[') return run(h.sendBackward);
      if (key === ']') return run(h.bringForward);
      if (lower === 'g') return run(h.toggleGrid);
      if (lower === 'p') return run(h.togglePreview);

      const step = e.shiftKey ? 10 : 1;
      if (key === 'ArrowLeft') return run(h.nudge, -step, 0);
      if (key === 'ArrowRight') return run(h.nudge, step, 0);
      if (key === 'ArrowUp') return run(h.nudge, 0, -step);
      if (key === 'ArrowDown') return run(h.nudge, 0, step);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
