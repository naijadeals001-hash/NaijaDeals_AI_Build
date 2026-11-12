import Image from "next/image";

/**
 * Project-path images use the Next image pipeline. Remote images are rendered
 * with a plain image element because the allow-list for remote optimisation is
 * deliberately not widened for editorial rows; the URL is validated on write
 * and again before public rendering.
 */
export function PlusMedia({
  src,
  alt,
  sizes,
  priority = false
}: {
  src: string;
  alt: string;
  sizes?: string;
  priority?: boolean;
}) {
  const internal = src.startsWith("/") && !src.startsWith("//");
  if (internal) {
    return <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}
