import { formatPaise, paise } from "@tanvi/domain";

export function Price({ pricePaise, comparePaise, className = "" }: { pricePaise: number; comparePaise?: number | null; className?: string }) {
  return (
    <span className={className}>
      <span className="font-medium">{formatPaise(paise(pricePaise))}</span>
      {comparePaise && comparePaise > pricePaise ? (
        <>
          {" "}
          <s className="text-sm text-cocoa">
            <span className="sr-only">Original price </span>
            {formatPaise(paise(comparePaise))}
          </s>
        </>
      ) : null}
    </span>
  );
}
