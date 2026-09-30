/** "my-tool_name" -> "My Tool Name" */
export function formatToolName(name: string): string {
  return name.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export function formatDuration(ms: number): string {
  const rounded = Math.max(0, Math.round(ms));
  if (rounded < 1000) return `${rounded}ms`;
  const s = rounded / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;

  const total = Math.round(s);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const rem = total % 60;
  const parts =
    d > 0
      ? [`${d}d`, h > 0 ? `${h}h` : "", m > 0 ? `${m}m` : ""]
      : h > 0
        ? [`${h}h`, m > 0 ? `${m}m` : "", rem > 0 ? `${rem}s` : ""]
        : [`${m}m`, rem > 0 ? `${rem}s` : ""];
  return parts.filter(Boolean).join(" ");
}
