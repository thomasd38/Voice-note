/**
 * Icônes SVG inline.
 *
 * Aucune librairie d'icônes : six symboles suffisent, autant les écrire à la
 * main (quelques centaines d'octets contre plusieurs dizaines de kilooctets).
 * Elles sont décoratives (`aria-hidden`) : le libellé accessible est toujours
 * porté par le bouton qui les contient.
 */

interface IconProps {
  size?: number;
  className?: string;
}

function svgProps({ size = 20, className }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false as const,
    className,
  };
}

export function MicIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v4" />
    </svg>
  );
}

export function StopIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)} fill="currentColor" stroke="none">
      <rect x="6" y="6" width="12" height="12" rx="2.5" />
    </svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)} fill="currentColor" stroke="none">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)} fill="currentColor" stroke="none">
      <rect x="7" y="5" width="4" height="14" rx="1.4" />
      <rect x="13" y="5" width="4" height="14" rx="1.4" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  );
}

/** Curseurs de réglage : plus explicite qu'un engrenage à petite taille. */
export function SettingsIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M4 7.5h10M17.5 7.5H20" />
      <circle cx="15.8" cy="7.5" r="2" />
      <path d="M4 16.5h4M11.5 16.5H20" />
      <circle cx="9.8" cy="16.5" r="2" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6.5 7 7.4 19a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5L17.5 7" />
      <path d="M10.5 11v6M13.5 11v6" />
    </svg>
  );
}

export function EditIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M4 20h4l10-10a2.4 2.4 0 0 0-3.4-3.4L4.6 16.6z" />
      <path d="m13.5 7 3.5 3.5" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function BackIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M15 5 8 12l7 7" />
    </svg>
  );
}

export function NoteIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M6 3h8.5L19 7.5V21H6z" />
      <path d="M14 3v5h5" />
      <path d="M9 12.5h7M9 16.5h5" />
    </svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M12 4v11" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M5 20h14" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <rect x="5" y="10" width="14" height="10" rx="2.2" />
      <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
    </svg>
  );
}
