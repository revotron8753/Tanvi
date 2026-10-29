import type { ReactNode } from "react";

export function Alert({ tone = "error", children }: { tone?: "error" | "success" | "info"; children: ReactNode }) {
  const tones = {
    error: "border-danger text-danger bg-white",
    success: "border-success text-success bg-white",
    info: "border-cocoa text-espresso bg-beige",
  } as const;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-sm border px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}
