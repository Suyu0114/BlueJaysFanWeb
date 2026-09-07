// P11: one shared SVG filter that gives the recoloured team logos a hand-drawn
// wobble, matching the rough.js chrome elsewhere on the site. Declared once in
// the root layout — a filter id is document-global, so 150 logos on the
// standings page reference this single definition instead of each carrying its
// own (and instead of 150 rough.js canvases + ResizeObservers).
//
// scale is deliberately small: at the 28px the logos render, anything past ~2
// smears the cap detail into mush.
export function SketchDefs() {
  return (
    <svg
      aria-hidden
      focusable="false"
      width="0"
      height="0"
      className="absolute"
      style={{ position: "absolute", width: 0, height: 0 }}
    >
      <defs>
        <filter id="sketch" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.045"
            numOctaves={2}
            seed={7}
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale={1.5}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
