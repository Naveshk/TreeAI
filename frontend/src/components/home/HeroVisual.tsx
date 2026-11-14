/** Decorative illustration of a forest of trees voting (purely illustrative, no data). */
export function HeroVisual() {
  const tree = (x: number, highlight: boolean) => (
    <g transform={`translate(${x} 0)`}>
      <path
        d="M60 30 L30 80 M60 30 L90 80 M30 80 L15 130 M30 80 L45 130 M90 80 L75 130 M90 80 L105 130"
        stroke="#34446a"
        strokeWidth="2"
        fill="none"
      />
      {highlight && (
        <path d="M60 30 L90 80 L75 130" stroke="#2dd4bf" strokeWidth="3" fill="none" />
      )}
      {[
        [60, 30],
        [30, 80],
        [90, 80],
        [15, 130],
        [45, 130],
        [75, 130],
        [105, 130],
      ].map(([cx, cy], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={i === 0 ? 9 : 7}
          fill={highlight && [0, 2, 5].includes(i) ? "#2dd4bf" : "#16213a"}
          stroke={highlight && [0, 2, 5].includes(i) ? "#99f6e4" : "#34446a"}
          strokeWidth="2"
        />
      ))}
    </g>
  );
  return (
    <svg viewBox="0 0 400 190" className="h-auto w-full" aria-hidden="true">
      {tree(0, false)}
      {tree(140, true)}
      {tree(280, false)}
      <path d="M60 150 L200 178 M200 150 L200 178 M340 150 L200 178" stroke="#24314f" strokeWidth="2" />
      <circle cx="200" cy="178" r="8" fill="#5eead4" />
    </svg>
  );
}
