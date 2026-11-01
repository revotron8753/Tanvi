import { getPrisma } from "@tanvi/database";
import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { moderateReviewAction } from "@/features/catalog/community-actions";
import { requireAdmin } from "@/server/auth/guard";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const auth = await requireAdmin("content.write");
  const reviews = await getPrisma().review.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: { product: { select: { name: true } } },
  });
  return (
    <AdminShell auth={auth}>
      <h1 className="text-3xl">Reviews</h1>
      <p className="mt-2 max-w-prose text-sm text-cocoa">
        Reviews appear on the storefront only after you approve them. They are not matched to orders, so they are shown as customer reviews, not verified purchases. The reviewer&apos;s email is for duplicate checks only and is never shown publicly.
      </p>
      {reviews.length === 0 ? <p className="mt-8">No reviews yet. They&apos;ll appear here when shoppers submit them.</p> : null}
      <ul className="mt-6 space-y-4">
        {reviews.map((r) => (
          <li key={r.id}>
            <Card>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">{r.product.name}</p>
                <p className="text-sm text-cocoa">{r.status.toLowerCase()} · {r.createdAt.toLocaleDateString("en-IN")}</p>
              </div>
              <p className="mt-1 text-sm">{r.rating} out of 5 · {r.authorName} ({r.email})</p>
              {r.title ? <p className="mt-2 font-medium">{r.title}</p> : null}
              <p className="mt-1 whitespace-pre-line">{r.body}</p>
              <div className="mt-4 flex gap-3">
                {r.status !== "APPROVED" ? <form action={moderateReviewAction.bind(null, r.id, "APPROVED")}><Button type="submit">Approve</Button></form> : null}
                {r.status !== "REJECTED" ? <form action={moderateReviewAction.bind(null, r.id, "REJECTED")}><Button type="submit" variant="secondary">Reject</Button></form> : null}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </AdminShell>
  );
}
