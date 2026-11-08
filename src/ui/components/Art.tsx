import { useMemo } from 'react';
import type { RibbonDef } from '../../regs/catalog/ribbons';
import type { BadgeDef } from '../../regs/catalog/badges';
import type { DeviceKind } from '../../regs/catalog/ribbons';
import { artUrl, useArtVersion } from '../art';
import { badgeArtIds, textureFor } from '../../three/textures';

/** Ribbon image: real artwork when the library has it, drawn stripes otherwise. */
export function RibbonArt({ def, device, count, framed, className }: {
  def: Pick<RibbonDef, 'id' | 'name' | 'stripes'>;
  device?: DeviceKind;
  count?: number;
  framed?: boolean;
  className?: string;
}) {
  const v = useArtVersion();
  const src = useMemo(() => {
    const url = artUrl(def.id);
    if (url && !device) return url;
    // draw (stripes or art + devices) onto a canvas
    const tex = textureFor({ type: 'rack', perRow: 1, ribbons: [{ id: def.id, stripes: def.stripes, name: def.name, device, count, framed }] }, 1.375, 0.375);
    return (tex.image as HTMLCanvasElement).toDataURL();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, device, count, framed, v]);
  return <img className={`ribbon-img ${className ?? ''}`} src={src} alt={def.name} draggable={false} />;
}

export function BadgeArt({ def, level, className }: { def: BadgeDef; level?: string; className?: string }) {
  const v = useArtVersion();
  const src = useMemo(() => {
    for (const id of badgeArtIds(def.id, level, def.levels)) {
      const u = artUrl(id);
      if (u) return u;
    }
    const tex = textureFor(def.kind === 'tab' || def.kind === 'state' ? { type: 'tab', label: def.label, id: def.id } : { type: 'badge', def, level }, 2.4, def.kind === 'tab' || def.kind === 'state' ? 0.6 : 1);
    return (tex.image as HTMLCanvasElement).toDataURL();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, level, v]);
  return <img className={`badge-img ${className ?? ''}`} src={src} alt={def.name} draggable={false} />;
}

