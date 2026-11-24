import type { CSSProperties } from "react";

/** Ready-made avatars in the app's palette: a symbol on a coloured disc. */
export const PRESETS: { id: string; glyph: string; bg: string; fg: string; label: string }[] = [
  { id: "spade", glyph: "♠", bg: "#1b1216", fg: "#fbf3e4", label: "Spader" },
  { id: "heart", glyph: "♥", bg: "#c8102e", fg: "#fbf3e4", label: "Hjärter" },
  { id: "diamond", glyph: "♦", bg: "#fbf3e4", fg: "#c8102e", label: "Ruter" },
  { id: "club", glyph: "♣", bg: "#17643f", fg: "#fbf3e4", label: "Klöver" },
  { id: "star", glyph: "★", bg: "#e6b55c", fg: "#5e0a14", label: "Stjärna" },
  { id: "crown", glyph: "♛", bg: "#5e0a14", fg: "#e6b55c", label: "Krona" },
  { id: "knight", glyph: "♞", bg: "#2b3a67", fg: "#fbf3e4", label: "Springare" },
  { id: "sun", glyph: "☀", bg: "#f0a43a", fg: "#5e0a14", label: "Sol" },
  { id: "moon", glyph: "☾", bg: "#24091a", fg: "#e6b55c", label: "Måne" },
  { id: "flower", glyph: "✿", bg: "#d96a8c", fg: "#fff", label: "Blomma" },
  { id: "spark", glyph: "✦", bg: "#0e4229", fg: "#e6b55c", label: "Gnista" },
  { id: "anchor", glyph: "⚓", bg: "#123a52", fg: "#fbf3e4", label: "Ankare" },
];

export interface Who { username: string; avatar?: string | null }

/** The face inside any avatar circle: uploaded photo, preset symbol, or first letter. */
export function AvatarFace({ who }: { who: Who }) {
  const a = who.avatar ?? "";
  if (a.startsWith("https://")) return <img className="face-img" src={a} alt="" loading="lazy" />;
  const p = a.startsWith("preset:") ? PRESETS.find((x) => x.id === a.slice(7)) : undefined;
  if (p) return <span className="face-preset" style={{ "--bg": p.bg, "--fg": p.fg } as CSSProperties}>{p.glyph + "︎"}</span>;
  return <span className="face-letter">{who.username.replace(" (bot)", "").slice(0, 1).toUpperCase()}</span>;
}

export function Avatar({ who, size = 40, className = "" }: { who: Who; size?: number; className?: string }) {
  return (
    <span className={`avatar-sm ${className}`} style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">
      <AvatarFace who={who} />
    </span>
  );
}

/** Crops the picture to a centred square and shrinks it, so uploads stay small. */
export async function squareWebp(file: File, size = 256): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas.getContext("2d")!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
  return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("Bilden kunde inte läsas"))), "image/webp", 0.85));
}
