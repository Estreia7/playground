export interface Classification {
  docType: string;
  label: string;
  suggestedName: string;
  orientation: "portrait" | "landscape";
  confidence: number;
  summary: string;
  tags: string[];
}

export interface StoredDoc {
  id: string;
  name: string;
  fileName: string;
  docType: string;
  label: string;
  tags: string[];
  pages: number;
  size: number;
  createdAt: string;
}

// A captured + processed page held in memory before saving.
export interface ScanPage {
  id: string;
  dataUrl: string; // processed JPEG data URL
  width: number;
  height: number;
}

export const DOC_TYPE_META: Record<string, { label: string; emoji: string }> = {
  id_card: { label: "ID Card", emoji: "🪪" },
  passport: { label: "Passport", emoji: "📘" },
  drivers_license: { label: "Driver's License", emoji: "🚗" },
  invoice: { label: "Invoice", emoji: "🧾" },
  receipt: { label: "Receipt", emoji: "🧾" },
  contract: { label: "Contract", emoji: "📄" },
  letter: { label: "Letter", emoji: "✉️" },
  business_card: { label: "Business Card", emoji: "💼" },
  certificate: { label: "Certificate", emoji: "🎓" },
  photo: { label: "Photo", emoji: "🖼️" },
  other: { label: "Document", emoji: "📄" },
};

export function docTypeMeta(t: string) {
  return DOC_TYPE_META[t] ?? DOC_TYPE_META.other;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
