import Link from "next/link";

export default function Forbidden() {
  return (
    <main className="grid min-h-screen place-items-center p-6 text-center">
      <div>
        <h1 className="text-3xl">Not authorised</h1>
        <p className="mt-2 text-cocoa">Your role does not include access to this area.</p>
        <Link href="/admin" className="mt-4 inline-block underline">
          Back to overview
        </Link>
      </div>
    </main>
  );
}
