"use client";

import { CLASS_META, type ClassLabel } from "@/lib/classify";
import { BOARD_GLYPH } from "@/components/ClassificationMarker";

export function MoveBadge({
  label,
  large,
  compact,
}: {
  label: ClassLabel;
  large?: boolean;
  /** Icon-only chip for move lists */
  compact?: boolean;
}) {
  const meta = CLASS_META[label];
  const glyph = BOARD_GLYPH[label] || meta.symbol;
  if (compact) {
    return (
      <span
        className="inline-flex items-center justify-center w-[1.35rem] h-[1.35rem] rounded-full text-[10px] font-bold text-white shrink-0"
        style={{ background: meta.color }}
        title={meta.title}
      >
        {glyph}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold ui rounded-full border ${
        large ? "text-sm px-2.5 py-1" : "text-[11px] px-1.5 py-0.5"
      }`}
      style={{ color: meta.color, borderColor: meta.color, background: `${meta.color}22` }}
      title={meta.title}
    >
      <span
        className="inline-flex items-center justify-center rounded-full text-white font-bold"
        style={{
          background: meta.color,
          width: large ? 22 : 16,
          height: large ? 22 : 16,
          fontSize: glyph.length > 1 ? (large ? 9 : 8) : large ? 12 : 10,
        }}
      >
        {glyph}
      </span>
      <span>{meta.title}</span>
    </span>
  );
}
