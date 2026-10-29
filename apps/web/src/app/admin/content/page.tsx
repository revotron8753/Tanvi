import { getPrisma } from "@tanvi/database";
import { CONTENT_KEYS, type ContentData, type ContentField } from "@tanvi/validation";
import { ActionForm } from "@/components/action-form";
import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/select";
import { saveContentAction } from "@/features/catalog/content-actions";
import { requireAdmin } from "@/server/auth/guard";

export const dynamic = "force-dynamic";

const LABELS: Record<ContentField, string> = {
  eyebrow: "Small heading above title", title: "Title", subtitle: "Subtitle", body: "Text", ctaLabel: "Button label", ctaHref: "Button link",
  imageKey: "Image", imageAlt: "Image description (for screen readers)", storeName: "Store name", address: "Address", hours: "Opening hours",
  phone: "Phone", email: "Email", whatsappNumber: "WhatsApp number (digits with country code)", instagram: "Instagram link", facebook: "Facebook link",
};
const LONG = new Set<ContentField>(["body", "address", "hours"]);

export default async function ContentPage() {
  const auth = await requireAdmin("content.write");
  const rows = await getPrisma().websiteContent.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r.data as ContentData]));
  const groups = [...new Set(CONTENT_KEYS.map((k) => k.group))];
  return (
    <AdminShell auth={auth}>
      <h1 className="text-3xl">Website content</h1>
      <p className="mt-2 max-w-prose text-sm text-cocoa">
        Everything here appears on the storefront exactly as written. A block with no text is simply not shown, and policy pages do not exist publicly until you write them. Policy and legal wording should be reviewed by the business owner or legal counsel.
      </p>
      {groups.map((g) => (
        <section key={g} className="mt-10 space-y-4" aria-labelledby={`g-${g}`}>
          <h2 id={`g-${g}`} className="text-2xl">{g}</h2>
          <div className="grid gap-6 lg:grid-cols-2">
            {CONTENT_KEYS.filter((k) => k.group === g).map((k) => {
              const data = byKey.get(k.key) ?? {};
              return (
                <Card key={k.key}>
                  <h3 className="mb-3 text-xl">{k.label}</h3>
                  <ActionForm action={saveContentAction.bind(null, k.key)} submitLabel="Save">
                    {k.fields.filter((f) => f !== "imageKey").map((f) =>
                      LONG.has(f) ? (
                        <Textarea key={f} label={LABELS[f]} name={f} defaultValue={(data[f] as string | undefined) ?? ""} rows={f === "body" ? 8 : 3} />
                      ) : (
                        <Field key={f} label={LABELS[f]} name={f} defaultValue={(data[f] as string | undefined) ?? ""} />
                      ),
                    )}
                    {k.fields.includes("imageKey") ? (
                      <>
                        {data.imageKey ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/media/${data.imageKey}/thumb.webp`} alt="" width={160} height={90} className="h-20 w-auto" />
                        ) : null}
                        <Field label="Image (JPEG, PNG or WebP)" name="image" type="file" accept="image/jpeg,image/png,image/webp" />
                        {data.imageKey ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="removeImage" /> Remove current image</label> : null}
                      </>
                    ) : null}
                  </ActionForm>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </AdminShell>
  );
}
