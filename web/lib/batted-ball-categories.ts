// Shared batted-ball outcome → category → brand-color mapping.
// Imported by both SprayChart and ExitVeloChart so the two charts color points
// identically; any future category/color change stays in one place.

export type Category = "hr" | "xbh" | "single" | "out";

export const CATEGORY_COLOR: Record<Category, string> = {
  hr: "var(--color-brick)",
  xbh: "var(--color-lava)",
  single: "var(--color-navy)",
  out: "var(--color-steel)",
};

// Draw order: outs at the back, home runs on top.
export const CATEGORY_Z: Record<Category, number> = {
  out: 0,
  single: 1,
  xbh: 2,
  hr: 3,
};

export function categorize(event: string | null): Category {
  switch (event) {
    case "home_run":
      return "hr";
    case "double":
    case "triple":
      return "xbh";
    case "single":
      return "single";
    default:
      return "out";
  }
}
