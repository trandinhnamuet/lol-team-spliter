/** Logo hextech: lục giác vàng lồng nhau, lõi kim cương xanh phát sáng. */
export default function HexLogo({ size = 30 }: { size?: number }) {
  return (
    <svg
      className="hex-brand-glyph"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="hexGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F0E6D2" />
          <stop offset="55%" stopColor="#C8AA6E" />
          <stop offset="100%" stopColor="#785A28" />
        </linearGradient>
      </defs>
      <polygon
        points="50,3 91,26 91,74 50,97 9,74 9,26"
        stroke="url(#hexGold)"
        strokeWidth="5"
      />
      <polygon
        points="50,16 80,33 80,67 50,84 20,67 20,33"
        stroke="#463714"
        strokeWidth="2.5"
      />
      <polygon className="glyph-core" points="50,30 67,50 50,70 33,50" fill="#0AC8B9" />
      <polygon points="50,38 60,50 50,62 40,50" fill="#CDFAFA" opacity="0.9" />
    </svg>
  );
}
