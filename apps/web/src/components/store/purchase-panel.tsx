"use client";

import { useMemo, useState } from "react";
import { ActionForm } from "@/components/action-form";
import { addToCartAction } from "@/features/shop/actions";
import { Price } from "./price";

export interface PanelVariant {
  id: string;
  size: string;
  colour: string;
  pricePaise: number;
  status: "in_stock" | "low_stock" | "out_of_stock";
}

const STATUS_TEXT = { in_stock: "In stock", low_stock: "Only a few left", out_of_stock: "Out of stock" } as const;

export function PurchasePanel({ variants, comparePaise }: { variants: PanelVariant[]; comparePaise: number | null }) {
  const sizes = useMemo(() => [...new Set(variants.map((v) => v.size))], [variants]);
  const colours = useMemo(() => [...new Set(variants.map((v) => v.colour))], [variants]);
  const firstAvailable = variants.find((v) => v.status !== "out_of_stock") ?? variants[0];
  const [size, setSize] = useState<string>(colours.length === 1 || !firstAvailable ? (firstAvailable?.size ?? "") : "");
  const [colour, setColour] = useState<string>(colours.length === 1 ? (colours[0] ?? "") : (firstAvailable?.colour ?? ""));
  const variant = variants.find((v) => v.size === size && v.colour === colour);
  const optionStatus = (s: string, c: string) => variants.find((v) => v.size === s && v.colour === c)?.status ?? "out_of_stock";
  const prices = variants.map((v) => v.pricePaise);
  const shown = variant?.pricePaise ?? Math.min(...prices);
  const range = !variant && Math.min(...prices) !== Math.max(...prices);

  return (
    <div className="space-y-5">
      <p className="text-xl">
        {range ? <span className="text-sm text-cocoa">From </span> : null}
        <Price pricePaise={shown} comparePaise={variant ? comparePaise : null} />
      </p>
      <ActionForm action={addToCartAction} submitLabel="Add to bag" pendingLabel="Adding…" className="space-y-5">
        <input type="hidden" name="variantId" value={variant?.id ?? ""} />
        {colours.length > 1 ? (
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Colour{colour ? `: ${colour}` : ""}</legend>
            <div className="flex flex-wrap gap-2">
              {colours.map((c) => (
                <label key={c} className={`cursor-pointer border px-3 py-2 text-sm ${colour === c ? "border-espresso bg-espresso text-ivory" : "border-taupe"}`}>
                  <input type="radio" name="colourChoice" value={c} checked={colour === c} onChange={() => setColour(c)} className="sr-only" />
                  {c}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Size{size ? `: ${size}` : ""}</legend>
          <div className="flex flex-wrap gap-2">
            {sizes.map((s) => {
              const st = colour ? optionStatus(s, colour) : variants.some((v) => v.size === s && v.status !== "out_of_stock") ? "in_stock" : "out_of_stock";
              return (
                <label
                  key={s}
                  className={`border px-4 py-2 text-sm ${st === "out_of_stock" ? "cursor-not-allowed border-beige text-cocoa line-through" : "cursor-pointer"} ${size === s ? "border-espresso bg-espresso text-ivory" : "border-taupe"}`}
                >
                  <input type="radio" name="sizeChoice" value={s} checked={size === s} disabled={st === "out_of_stock"} onChange={() => setSize(s)} className="sr-only" />
                  {s}
                  {st === "out_of_stock" ? <span className="sr-only"> (out of stock)</span> : null}
                </label>
              );
            })}
          </div>
        </fieldset>
        <p className="text-sm" aria-live="polite">
          {variant ? (
            <span className={variant.status === "out_of_stock" ? "text-danger" : variant.status === "low_stock" ? "text-cocoa" : "text-success"}>{STATUS_TEXT[variant.status]}</span>
          ) : (
            <span className="text-cocoa">Select a {colours.length > 1 && !colour ? "colour and " : ""}size to see availability.</span>
          )}
        </p>
        <input type="hidden" name="quantity" value="1" />
      </ActionForm>
    </div>
  );
}
