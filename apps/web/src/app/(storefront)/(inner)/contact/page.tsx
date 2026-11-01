import { getPrisma } from "@tanvi/database";
import type { Metadata } from "next";
import { getContent } from "@/server/storefront/queries";

export const metadata: Metadata = { title: "Contact", alternates: { canonical: "/contact" } };
export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const c = await getContent(getPrisma(), "site.contact");
  const rows: [string, string | undefined][] = [["Visit us", c?.address], ["Hours", c?.hours], ["Phone", c?.phone], ["Email", c?.email]];
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-4xl">Contact</h1>
      {!c ? (
        <p className="mt-6 text-cocoa">Contact details will be added here soon.</p>
      ) : (
        <dl className="mt-8 space-y-5">
          {rows.filter(([, v]) => v).map(([k, v]) => (
            <div key={k}>
              <dt className="text-sm text-cocoa">{k}</dt>
              <dd className="whitespace-pre-line">{v}</dd>
            </div>
          ))}
          {c.whatsappNumber ? (
            <div>
              <dt className="text-sm text-cocoa">WhatsApp</dt>
              <dd><a className="underline" rel="noopener noreferrer" target="_blank" href={`https://wa.me/${c.whatsappNumber}`}>Message us on WhatsApp</a></dd>
            </div>
          ) : null}
        </dl>
      )}
    </div>
  );
}
