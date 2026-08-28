"use client";

/** Ô nhập số người mỗi team (mặc định 5), dùng chung cho trang chia team và trang sự kiện. */
export default function TeamSizeInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2.5">
      <span className="whitespace-nowrap font-display text-[0.62rem] font-bold uppercase tracking-[0.2em] text-gold-200">
        Người / team
      </span>
      <input
        type="number"
        min={1}
        max={20}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="hex-input w-16 px-2 py-1.5 text-center font-mono text-sm"
        title="Số người mỗi team (1–20). Người thừa sẽ được ghép làm dự bị."
      />
    </label>
  );
}

/** Parse giá trị ô nhập; trả null nếu không hợp lệ. */
export function parseTeamSize(value: string): number | null {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1 || n > 20) return null;
  return n;
}
