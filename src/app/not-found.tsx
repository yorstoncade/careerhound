import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="mt-2 text-sm text-zinc-500">That job may have been removed.</p>
      <Link href="/" className="btn mt-6">Browse jobs</Link>
    </div>
  );
}
