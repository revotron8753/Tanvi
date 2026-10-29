"use client";

import { useState } from "react";

interface Img {
  key: string;
  alt: string;
}

export function Gallery({ images, name }: { images: Img[]; name: string }) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const current = images[index];
  if (!current) {
    return <div className="grid aspect-[3/4] place-items-center bg-beige text-cocoa">No image</div>;
  }
  return (
    <div className="grid gap-3 md:grid-cols-[5rem_1fr]">
      <ul className="order-2 flex gap-2 md:order-1 md:flex-col" aria-label={`${name} images`}>
        {images.map((img, i) => (
          <li key={img.key}>
            <button
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show image ${i + 1} of ${images.length}`}
              aria-current={i === index}
              className={`block aspect-[3/4] w-16 overflow-hidden border md:w-full ${i === index ? "border-espresso" : "border-transparent"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/media/${img.key}/thumb.webp`} alt="" width={160} height={213} className="size-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
      <div
        className="relative order-1 aspect-[3/4] cursor-zoom-in overflow-hidden bg-beige md:order-2"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
        }}
        onMouseLeave={() => setZoom(null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/media/${current.key}/lg.webp`}
          alt={current.alt}
          width={1200}
          height={1600}
          className="size-full object-cover transition-transform duration-150"
          style={zoom ? { transform: "scale(2)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
        />
      </div>
    </div>
  );
}
