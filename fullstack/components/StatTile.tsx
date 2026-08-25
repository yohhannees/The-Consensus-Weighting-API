interface StatTileProps {
  label: string;
  value: string;
  sublabel?: string;
}

export function StatTile({ label, value, sublabel }: StatTileProps) {
  return (
    <div
      className="flex flex-col gap-1.5 rounded-2xl px-5 py-4"
      style={{ background: "var(--surface)", border: "1px solid var(--ring)" }}
    >
      <span className="text-[13px] font-medium" style={{ color: "var(--ink-muted)" }}>
        {label}
      </span>
      <span className="text-[28px] font-semibold leading-none" style={{ color: "var(--ink-primary)" }}>
        {value}
      </span>
      {sublabel ? (
        <span className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>
          {sublabel}
        </span>
      ) : null}
    </div>
  );
}
