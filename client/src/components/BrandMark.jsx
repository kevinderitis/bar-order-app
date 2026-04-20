import { ReceiptText, Utensils } from "lucide-react";

export default function BrandMark({ compact = false }) {
  return (
    <div className={compact ? "brand-mark brand-mark-compact" : "brand-mark"} aria-label="Arena Bar">
      <Utensils size={compact ? 18 : 24} strokeWidth={2.4} />
      <ReceiptText size={compact ? 22 : 30} strokeWidth={2.2} />
    </div>
  );
}
