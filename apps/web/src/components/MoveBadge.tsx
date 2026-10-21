"use client";

import { CLASS_META, type ClassLabel } from "@/lib/classify";

export function MoveBadge({
  label,
  large,
}: {
  label: ClassLabel;
  large?: boolean;
}) {
  const meta = CLASS_META[label];
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold ui rounded-sm border ${
        large ? "text-sm px-2.5 py-1" : "text-[11px] px-1.5 py-0.5"
      }`}
      style={{ color: meta.color, borderColor: meta.color, background: `${meta.color}18` }}
      title={meta.title}
    >
      {meta.symbol ? <span className="font-bold">{meta.symbol}</span> : null}
      <span>{meta.title}</span>
    </span>
  );
}
