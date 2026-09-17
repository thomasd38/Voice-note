import { useEffect, useState } from 'react';

/**
 * Détection de l'expérience à afficher.
 *
 * Les seuils ne sont pas arbitraires :
 *  - < 768 px  : téléphone — une seule colonne, pouce, navigation par vues.
 *  - 768-1099  : tablette — deux colonnes (liste + détail) tiennent, mais pas
 *                la barre latérale de filtres sans étouffer la liste.
 *  - ≥ 1100 px : desktop — 240 px de barre latérale + 380 px de liste +
 *                ~480 px de détail, soit la mise en page à trois panneaux.
 */
export const BREAKPOINTS = {
  tablet: 768,
  desktop: 1100,
} as const;

export type DeviceKind = 'mobile' | 'tablet' | 'desktop';

function readDevice(): DeviceKind {
  if (typeof window === 'undefined') return 'desktop';
  const width = window.innerWidth;
  if (width < BREAKPOINTS.tablet) return 'mobile';
  if (width < BREAKPOINTS.desktop) return 'tablet';
  return 'desktop';
}

export function useDevice(): DeviceKind {
  const [device, setDevice] = useState<DeviceKind>(readDevice);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;

    const queries = [
      window.matchMedia(`(max-width: ${BREAKPOINTS.tablet - 1}px)`),
      window.matchMedia(
        `(min-width: ${BREAKPOINTS.tablet}px) and (max-width: ${BREAKPOINTS.desktop - 1}px)`,
      ),
    ];
    const update = () => setDevice(readDevice());
    queries.forEach((query) => query.addEventListener('change', update));
    update();
    return () => queries.forEach((query) => query.removeEventListener('change', update));
  }, []);

  return device;
}
