import type { Category, Product } from "@tanvi/database";
import { sizeChartSchema } from "@tanvi/validation";
import { Field } from "@/components/ui/field";
import { Select, Textarea } from "@/components/ui/select";

function sizeChartText(v: unknown): string {
  const c = sizeChartSchema.safeParse(v);
  return c.success ? [c.data.columns, ...c.data.rows].map((r) => r.join(",")).join("\n") : "";
}

const rupees = (paise: number | null | undefined): string => (paise == null ? "" : `${Math.trunc(paise / 100)}${paise % 100 ? `.${String(paise % 100).padStart(2, "0")}` : ""}`);

export function ProductFields({ product, categories }: { product?: Product; categories: Pick<Category, "id" | "name">[] }) {
  const p = product;
  const check = (name: string, label: string, v: boolean | undefined) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={v} /> {label}
    </label>
  );
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Name" name="name" defaultValue={p?.name} required />
      <Select label="Category" name="categoryId" defaultValue={p?.categoryId} required>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Field label="Price (₹)" name="price" inputMode="decimal" defaultValue={rupees(p?.pricePaise)} required hint="Typed in rupees, e.g. 1999 or 1,999.50." />
      <Field label="Original price (₹), optional" name="comparePrice" inputMode="decimal" defaultValue={rupees(p?.comparePricePaise)} hint="Shown struck-through only when higher than the price." />
      <Field label="Parent code" name="parentCode" defaultValue={p?.parentCode ?? ""} />
      <Field label="HSN code (for GST invoices)" name="hsnCode" defaultValue={p?.hsnCode ?? ""} />
      {p ? <Field label="URL slug" name="slug" defaultValue={p.slug} hint="Changing this changes the product's web address." /> : null}
      <div className="md:col-span-2">
        <Textarea label="Description" name="description" defaultValue={p?.description ?? ""} />
      </div>
      <Field label="Fabric" name="fabric" defaultValue={p?.fabric ?? ""} />
      <Field label="Fit" name="fit" defaultValue={p?.fit ?? ""} />
      <Field label="Neckline" name="neckline" defaultValue={p?.neckline ?? ""} />
      <Field label="Sleeve length" name="sleeveLength" defaultValue={p?.sleeveLength ?? ""} />
      <Field label="Garment length" name="garmentLength" defaultValue={p?.garmentLength ?? ""} />
      <Field label="Pattern" name="pattern" defaultValue={p?.pattern ?? ""} />
      <div className="md:col-span-2">
        <Textarea label="Care instructions" name="careInstructions" defaultValue={p?.careInstructions ?? ""} />
      </div>
      <div className="md:col-span-2">
        <Textarea
          label="Size chart (optional)"
          name="sizeChart"
          rows={6}
          defaultValue={sizeChartText(p?.sizeChart)}
          placeholder={"Size,Bust (in),Waist (in),Length (in)\nS,34,30,44"}
        />
        <p className="mt-1 text-xs text-cocoa">First line: column headings. One line per size, comma-separated, in inches or whatever you use. Shown on the product page only when filled in.</p>
      </div>
      <Field label="SEO title" name="seoTitle" defaultValue={p?.seoTitle ?? ""} />
      <Field label="SEO description" name="seoDescription" defaultValue={p?.seoDescription ?? ""} />
      <fieldset className="space-y-2 md:col-span-2">
        <legend className="text-sm font-medium">Merchandising</legend>
        {check("isFeatured", "Featured", p?.isFeatured)}
        {check("isNewArrival", "New arrival", p?.isNewArrival)}
        {check("showOnHomepage", "Show on homepage", p?.showOnHomepage)}
        {check("tryOnEligible", "Eligible for AI try-on (garment image must be approved later)", p?.tryOnEligible)}
      </fieldset>
    </div>
  );
}
