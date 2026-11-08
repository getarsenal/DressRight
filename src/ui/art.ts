/**
 * Insignia artwork registry.
 *
 * Loads /insignia/manifest.json (public-domain artwork, see
 * public/insignia/ATTRIBUTION.md) and preloads images so both the 2D UI and
 * the 3D canvas textures can use real ribbon/badge art. Anything without art
 * falls back to the procedural drawing, so the app works with no manifest.
 */
import { useEffect, useState } from 'react';

export interface ArtItem {
  id: string;
  name: string;
  kind: 'ribbon' | 'unit-award' | 'device' | 'badge' | 'tab';
  service?: string;
  file: string;
  width: number;
  height: number;
  framed?: boolean;
  inCatalog?: boolean;
  commonsPage?: string;
  license?: string;
  author?: string;
}

const BASE = `${import.meta.env.BASE_URL}insignia/`;
let items = new Map<string, ArtItem>();
const images = new Map<string, HTMLImageElement>();
let version = 0;
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;

const notify = () => {
  version++;
  listeners.forEach((l) => l());
};

export function loadArt(): Promise<void> {
  if (loading) return loading;
  loading = fetch(`${BASE}manifest.json`)
    .then((r) => (r.ok ? r.json() : { items: [] }))
    .then((m: { items?: ArtItem[] }) => {
      items = new Map((m.items ?? []).map((i) => [i.id, i]));
      notify();
    })
    .catch(() => undefined);
  return loading;
}

export const artUrl = (id: string) => {
  const it = items.get(id);
  return it ? BASE + it.file : undefined;
};
export const artItem = (id: string) => items.get(id);
export const allArt = () => [...items.values()];
export const artVersion = () => version;

/** Returns a decoded image for drawing on canvas, starting a load if needed. */
export function artImage(id: string): HTMLImageElement | undefined {
  const url = artUrl(id);
  if (!url) return undefined;
  let img = images.get(id);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.onload = notify;
    img.src = url;
    images.set(id, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : undefined;
}

/** Re-render when the manifest or any image finishes loading. */
export function useArtVersion() {
  const [v, setV] = useState(version);
  useEffect(() => {
    loadArt();
    const l = () => setV(version);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return v;
}
