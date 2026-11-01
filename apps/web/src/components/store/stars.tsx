export function Stars({ rating, className = "" }: { rating: number; className?: string }) {
  const full = Math.round(rating);
  return (
    <span className={`inline-flex gap-0.5 text-champagne ${className}`} role="img" aria-label={`${rating.toFixed(1).replace(/\.0$/, "")} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" fill={n <= full ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.2">
          <path d="m10 1.8 2.5 5.3 5.7.8-4.1 4 1 5.7L10 14.9l-5.1 2.7 1-5.7-4.1-4 5.7-.8z" />
        </svg>
      ))}
    </span>
  );
}
