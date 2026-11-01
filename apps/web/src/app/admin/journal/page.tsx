import { getPrisma } from "@tanvi/database";
import { ActionForm } from "@/components/action-form";
import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/select";
import { saveJournalAction } from "@/features/catalog/community-actions";
import { requireAdmin } from "@/server/auth/guard";

export const dynamic = "force-dynamic";

export default async function JournalAdminPage() {
  const auth = await requireAdmin("content.write");
  const posts = await getPrisma().journalPost.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <AdminShell auth={auth}>
      <h1 className="text-3xl">Journal</h1>
      <p className="mt-2 max-w-prose text-sm text-cocoa">Posts appear on the storefront journal once published. Drafts are visible only here.</p>
      <section className="mt-8 max-w-2xl space-y-3" aria-labelledby="new-post">
        <h2 id="new-post" className="text-2xl">Write a post</h2>
        <PostForm postId={null} />
      </section>
      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        {posts.map((p) => (
          <Card key={p.id}>
            <p className="mb-3 text-sm text-cocoa">{p.status === "PUBLISHED" ? "Published" : "Draft"}</p>
            <PostForm postId={p.id} post={p} />
          </Card>
        ))}
      </div>
    </AdminShell>
  );
}

function PostForm({ postId, post }: { postId: string | null; post?: { title: string; slug: string; excerpt: string | null; body: string; imageKey: string | null; imageAlt: string | null; status: string } }) {
  return (
    <ActionForm action={saveJournalAction.bind(null, postId)} submitLabel={postId ? "Save post" : "Create post"}>
      <Field label="Title" name="title" defaultValue={post?.title ?? ""} required />
      <Field label="URL slug (optional)" name="slug" defaultValue={post?.slug ?? ""} />
      <Textarea label="Short summary" name="excerpt" rows={2} defaultValue={post?.excerpt ?? ""} />
      <Textarea label="Post" name="body" rows={10} defaultValue={post?.body ?? ""} required />
      {post?.imageKey ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/media/${post.imageKey}/thumb.webp`} alt="" width={160} height={90} className="h-20 w-auto" />
      ) : null}
      <Field label="Cover image (JPEG, PNG or WebP)" name="image" type="file" accept="image/jpeg,image/png,image/webp" />
      <Field label="Image description (for screen readers)" name="imageAlt" defaultValue={post?.imageAlt ?? ""} />
      {post?.imageKey ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="removeImage" /> Remove current image</label> : null}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="published" defaultChecked={post?.status === "PUBLISHED"} /> Published</label>
    </ActionForm>
  );
}
