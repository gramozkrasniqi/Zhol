/** The Albanian double-headed eagle, drawn as if burnt into the wood of the sofra.
 *  One half is drawn and mirrored, so the two heads are always symmetrical. */
const HALF =
  "M0 -38C5 -46 9 -55 14 -63C18 -71 27 -77 36 -74L50 -72L42 -66L47 -61L37 -61C31 -60 26 -57 23 -51" +
  "C21 -46 20 -41 22 -35C40 -52 66 -70 97 -79L89 -66L99 -62L87 -51L95 -45L81 -35L89 -28L73 -21L79 -12L62 -9L66 0L46 -1" +
  "C38 4 30 12 26 22L36 40L24 39L31 56L17 51L21 70L9 62L7 88L0 79Z";

export function Eagle({ className = "" }: { className?: string }) {
  return (
    <svg className={`eagle ${className}`} viewBox="-110 -100 220 200" aria-hidden="true">
      <defs>
        <filter id="burn" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
        <g id="eagle-half"><path d={HALF} /></g>
      </defs>
      {/* scorched halo, then the dark burnt shape, then a faint inner line like a branding iron */}
      <g fill="#2a1206" opacity=".35" filter="url(#burn)" transform="scale(1.04)">
        <use href="#eagle-half" /><use href="#eagle-half" transform="scale(-1 1)" />
      </g>
      <g fill="#3b1a0a" opacity=".78">
        <use href="#eagle-half" /><use href="#eagle-half" transform="scale(-1 1)" />
      </g>
      <g fill="none" stroke="#1b0b03" strokeWidth="1.4" opacity=".55" transform="scale(.9)">
        <use href="#eagle-half" /><use href="#eagle-half" transform="scale(-1 1)" />
      </g>
      <circle cx="32" cy="-68" r="2" fill="#c99a62" opacity=".5" />
      <circle cx="-32" cy="-68" r="2" fill="#c99a62" opacity=".5" />
    </svg>
  );
}
