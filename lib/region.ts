export interface RegionOption {
  value: string;
  label: string;
}

/** Danh sách server LMHT hỗ trợ — value là platform routing của Riot API. */
export const REGIONS: RegionOption[] = [
  { value: "vn2", label: "Việt Nam" },
  { value: "kr", label: "Hàn Quốc" },
  { value: "jp1", label: "Nhật Bản" },
  { value: "tw2", label: "Đài Loan" },
  { value: "ph2", label: "Philippines" },
  { value: "sg2", label: "Singapore / Malaysia" },
  { value: "th2", label: "Thái Lan" },
  { value: "oc1", label: "Châu Đại Dương" },
  { value: "na1", label: "Bắc Mỹ" },
  { value: "br1", label: "Brazil" },
  { value: "la1", label: "Mỹ Latinh (Bắc)" },
  { value: "la2", label: "Mỹ Latinh (Nam)" },
  { value: "euw1", label: "Tây Âu" },
  { value: "eun1", label: "Đông Âu" },
  { value: "tr1", label: "Thổ Nhĩ Kỳ" },
  { value: "ru", label: "Nga" },
  { value: "me1", label: "Trung Đông" },
];

export const DEFAULT_REGION = "vn2";

const STORAGE_KEY = "lts.region";

export function isKnownRegion(value: string): boolean {
  return REGIONS.some((r) => r.value === value.toLowerCase());
}

/** Đọc khu vực đã chọn từ localStorage (mặc định Việt Nam nếu chưa chọn / SSR). */
export function getStoredRegion(): string {
  if (typeof window === "undefined") return DEFAULT_REGION;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v && isKnownRegion(v) ? v : DEFAULT_REGION;
  } catch {
    return DEFAULT_REGION;
  }
}

export function setStoredRegion(value: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* localStorage có thể bị chặn (chế độ ẩn danh) — bỏ qua */
  }
}
