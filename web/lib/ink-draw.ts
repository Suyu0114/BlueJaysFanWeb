// "Pen drawing" entrance for rough.js output (ScorecardFrame, ScheduleCalendar).
//
// rough.js emits one stroke <path> per shape whose `d` holds several sub-strokes
// (a rectangle = 4 edges x 2 wobbly passes = 8 `M…` subpaths). Dashing a
// multi-subpath path animates every subpath at once (browsers restart the dash
// per subpath), so we split each stroke into one <path> per subpath, give each
// pathLength="1", and stagger them — the frame then sketches in edge by edge.
// Solid fills (stroke="none") just fade in. The keyframes live in globals.css
// (.ink-stroke / .ink-fill) and are disabled under prefers-reduced-motion.

export type InkOptions = {
  /** ms before the first stroke starts */
  delay?: number;
  /** ms between successive sub-strokes */
  step?: number;
  /** ms each sub-stroke takes to draw */
  dur?: number;
};

/**
 * Animate every rough.js path under `root` in document order. Returns the ms at
 * which the last stroke finishes, so callers can chain the next group after it.
 */
export function inkify(
  root: Element,
  { delay = 0, step = 60, dur = 360 }: InkOptions = {},
): number {
  let i = 0;
  for (const path of Array.from(root.querySelectorAll("path"))) {
    const at = delay + i * step;

    if (path.getAttribute("stroke") === "none") {
      path.classList.add("ink-fill");
      path.style.animationDelay = `${at}ms`;
      continue;
    }

    const subpaths = (path.getAttribute("d") ?? "")
      .split(/(?=M)/)
      .map((s) => s.trim())
      .filter(Boolean);
    const parent = path.parentNode;
    if (!parent) continue;

    for (const d of subpaths) {
      const sub = path.cloneNode(false) as SVGPathElement;
      sub.setAttribute("d", d);
      sub.setAttribute("pathLength", "1");
      sub.classList.add("ink-stroke");
      sub.style.animationDelay = `${delay + i * step}ms`;
      sub.style.setProperty("--ink-dur", `${dur}ms`);
      parent.insertBefore(sub, path);
      i++;
    }
    parent.removeChild(path);
  }
  return delay + Math.max(0, i - 1) * step + dur;
}
