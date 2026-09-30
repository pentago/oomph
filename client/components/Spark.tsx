// Orange burst used as the assistant mark and on the welcome screen.
const RAYS = Array.from({ length: 12 }, (_, i) => i);

export function Spark({ size = 24, class: cls = "" }: { size?: number; class?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.1"
      stroke-linecap="round"
      class={`text-accent-brand ${cls}`}
      aria-hidden="true"
    >
      {RAYS.map(i => (
        <line key={i} x1="12" y1={i % 2 ? 6.5 : 4.5} x2="12" y2="1.8" transform={`rotate(${i * 30} 12 12)`} />
      ))}
    </svg>
  );
}
