import { useCallback, useEffect, useRef, useState } from "react";

// Hover state for dense chart marks. A plain onMouseLeave → null makes the
// tooltip blink off and back on every time the pointer crosses the gap between
// two neighbouring dots; here `leave` waits `lingerMs` before clearing, and an
// `enter` in the meantime cancels it — so the tooltip glides dot-to-dot instead.
//
// `last` is the most recent non-null target. The tooltip keeps rendering it
// while it fades out, after `hovered` has already gone null.
export function useLingeringHover<T>(lingerMs = 120) {
  const [hovered, setHovered] = useState<T | null>(null);
  const [last, setLast] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const enter = useCallback(
    (target: T) => {
      cancel();
      setHovered(target);
      setLast(target);
    },
    [cancel],
  );

  const leave = useCallback(() => {
    cancel();
    timer.current = setTimeout(() => {
      timer.current = null;
      setHovered(null);
    }, lingerMs);
  }, [cancel, lingerMs]);

  useEffect(() => cancel, [cancel]);

  return { hovered, last, enter, leave };
}
