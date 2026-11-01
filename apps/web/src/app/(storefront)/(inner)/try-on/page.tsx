import { getPrisma } from "@tanvi/database";
import type { Metadata } from "next";
import Link from "next/link";
import { getAiTryOnProvider } from "@/server/tryon/instance";
import { getTryOnConfig } from "@/server/tryon/service";

export const metadata: Metadata = { title: "Virtual try-on", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function TryOnPage() {
  const cfg = await getTryOnConfig(getPrisma());
  const available = cfg.onlineEnabled && getAiTryOnProvider() !== null;
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <h1 className="text-4xl">Virtual try-on</h1>
      {available ? (
        <p className="mt-4 text-cocoa">Online try-on is being finalised.</p>
      ) : (
        <p className="mt-4 text-cocoa">Online virtual try-on isn&apos;t available yet. Visit our store to try it on our mirror.</p>
      )}
      <Link href="/shop" className="mt-6 inline-block underline">Continue shopping</Link>
    </div>
  );
}
