import { getPrisma } from "@tanvi/database";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/select";
import { Stars } from "@/components/store/stars";
import { submitReviewAction } from "@/features/shop/actions";
import { productReviewSummary } from "@/server/community/service";

export async function ProductReviews({ productId }: { productId: string }) {
  const { count, average, reviews } = await productReviewSummary(getPrisma(), productId);
  return (
    <section className="mt-20 border-t border-beige pt-12" aria-labelledby="reviews-h">
      <div className="grid gap-12 lg:grid-cols-[1fr_24rem]">
        <div>
          <h2 id="reviews-h" className="text-3xl tracking-[0.08em]">Customer reviews</h2>
          {count > 0 && average !== null ? (
            <p className="mt-3 flex items-center gap-3 text-sm">
              <Stars rating={average} /> {average.toFixed(1)} from {count} {count === 1 ? "review" : "reviews"}
            </p>
          ) : (
            <p className="mt-3 text-cocoa">No reviews yet. Be the first to share how it wore.</p>
          )}
          <ul className="mt-8 space-y-8">
            {reviews.map((r) => (
              <li key={r.id} className="border-b border-beige pb-8">
                <Stars rating={r.rating} />
                {r.title ? <h3 className="mt-2 font-sans text-base font-medium">{r.title}</h3> : null}
                <p className="mt-2 max-w-prose whitespace-pre-line leading-7">{r.body}</p>
                <p className="mt-3 text-sm text-cocoa">{r.authorName}, {r.createdAt.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="h-fit bg-beige/50 p-6">
          <h3 className="text-2xl">Write a review</h3>
          <p className="mt-1 text-sm text-cocoa">We read every review before it appears. Your email is never shown.</p>
          <ActionForm action={submitReviewAction} submitLabel="Submit review" className="mt-4 space-y-3">
            <input type="hidden" name="productId" value={productId} />
            {/* Bot trap: hidden from people and assistive tech. */}
            <div aria-hidden="true" className="absolute -left-[9999px]">
              <input type="text" name="website" tabIndex={-1} autoComplete="off" />
            </div>
            <fieldset>
              <legend className="mb-1 text-sm font-medium">Rating</legend>
              <div className="flex gap-4">
                {[5, 4, 3, 2, 1].map((n) => (
                  <label key={n} className="flex items-center gap-1 text-sm">
                    <input type="radio" name="rating" value={n} required /> {n}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Your name" name="authorName" autoComplete="given-name" required maxLength={60} />
            <Field label="Email" name="email" type="email" autoComplete="email" required />
            <Field label="Headline (optional)" name="title" maxLength={100} />
            <Textarea label="Your review" name="body" required minLength={10} maxLength={2000} />
          </ActionForm>
        </div>
      </div>
    </section>
  );
}
