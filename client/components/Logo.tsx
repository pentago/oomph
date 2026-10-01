// App mark and working indicator: a ring of fat triangles chasing clockwise; the fading tail makes a rotation visible.
const TRIANGLES = Array.from({ length: 5 }, (_, i) => i);

export function Logo({ size = 24, class: cls = "" }: { size?: number; class?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      stroke-width="0.8"
      stroke-linejoin="round"
      class={`text-accent-brand ${cls}`}
      aria-hidden="true"
    >
      {TRIANGLES.map(i => (
        <polygon
          key={i}
          points="16.4,4.4 9.2,0.9 9.2,7.9"
          opacity={1 - i * 0.17}
          transform={`rotate(${i * 72} 12 12)`}
        />
      ))}
    </svg>
  );
}
