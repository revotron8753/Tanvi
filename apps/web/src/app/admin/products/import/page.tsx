import { ActionForm } from "@/components/action-form";
import { AdminShell } from "@/components/admin-shell";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { importProductsAction } from "@/features/catalog/import-action";
import { requireAdmin } from "@/server/auth/guard";
import { PRODUCT_CSV_COLUMNS } from "@/server/catalog/products";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const auth = await requireAdmin("products.write");
  return (
    <AdminShell auth={auth}>
      <h1 className="text-3xl">Import products</h1>
      <p className="mt-2 max-w-prose text-sm text-cocoa">
        One row per variant. Rows with the same <code>parentCode</code> become one draft product. Existing products are never overwritten. Prices are in paise (₹1,999 = 199900). Images are added afterwards.
      </p>
      <p className="mt-2 text-xs text-cocoa">Columns: {PRODUCT_CSV_COLUMNS.join(", ")} (status is ignored; imports are always drafts).</p>
      <div className="mt-6 max-w-md">
        <ActionForm action={importProductsAction} submitLabel="Run" pendingLabel="Working…">
          <Field label="CSV file" name="file" type="file" accept=".csv,text/csv" required />
          <Select label="Mode" name="mode">
            <option value="check">Check only (saves nothing)</option>
            <option value="import">Import</option>
          </Select>
        </ActionForm>
      </div>
    </AdminShell>
  );
}
