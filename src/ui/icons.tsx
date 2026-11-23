import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconSelect = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 3l6.5 17 2.2-6.6L20 11z" />
  </Svg>
);

export const IconPan = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v18M3 12h18" />
    <path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
  </Svg>
);

export const IconCity = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 21V9l3-1.6L10 9V5l2-1.6L14 5v4l3-1.6L20 9v12z" />
    <path d="M2.5 21h19" />
    <path d="M9 21v-4.5h3V21" />
  </Svg>
);

export const IconRoad = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20c5-1 5-7 8-8s4-5 8-8" />
    <path d="M4 16c4-.6 4-5 7-6s4-4 9-6" strokeDasharray="2 3" />
  </Svg>
);

export const IconRail = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 19L20 5" />
    <path d="M6 15l2.5 2.5M10 11l2.5 2.5M14 7l2.5 2.5M18 3.5L20 5" strokeWidth={1.3} />
  </Svg>
);

export const IconSea = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 15.5h16l-2.4 3.4H6.4z" />
    <path d="M12 3.5v9.6" />
    <path d="M12.7 4.8l4.6 6.4h-4.6z" />
    <path d="M2.5 21c1.6 0 1.6-1.2 3.2-1.2s1.6 1.2 3.2 1.2 1.6-1.2 3.2-1.2 1.6 1.2 3.2 1.2 1.6-1.2 3.2-1.2 1.6 1.2 3.2 1.2" strokeWidth={1.2} />
  </Svg>
);

export const IconRiver = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7c3.2 0 3.2 5 6.4 5s3.2-5 6.4-5S19 12 21 12" strokeWidth={2} />
    <path d="M3 14c3.2 0 3.2 4 6.4 4s3.2-4 6.4-4" strokeWidth={2} opacity={0.5} />
  </Svg>
);

export const IconRegion = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8.5l7.5-4.5L20 8l-1.5 9.5L9 20l-5-4.5z" />
    <path d="M11.5 4v16" opacity={0.35} strokeDasharray="2 3" />
  </Svg>
);

export const IconLabel = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 6h14M12 6v13" />
    <path d="M9 19h6" strokeWidth={1.3} />
  </Svg>
);

export const IconLandBrush = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15.5 3.5l5 5-8 8-5-5z" />
    <path d="M7.5 11.5l5 5-2.2 2.2a2.7 2.7 0 01-3.8-3.8z" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconWaterBrush = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5c3.2 4 5.5 6.9 5.5 10a5.5 5.5 0 01-11 0c0-3.1 2.3-6 5.5-10z" />
    <path d="M9 14.2c.9 0 .9 1.3 1.8 1.3s.9-1.3 1.8-1.3 1 1.3 1.9 1.3" strokeWidth={1.2} />
  </Svg>
);

export const IconEye = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 12S6 6.2 12 6.2 21.5 12 21.5 12 18 17.8 12 17.8 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.6" />
  </Svg>
);

export const IconEyeOff = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5l16 14" />
    <path d="M9.2 7.1A9.7 9.7 0 0112 6.2c6 0 9.5 5.8 9.5 5.8a17 17 0 01-2.6 3.3" />
    <path d="M6.4 8.6A17 17 0 002.5 12S6 17.8 12 17.8a9.4 9.4 0 003.6-.7" />
  </Svg>
);

export const IconLock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
    <path d="M8.5 10.5V7.8a3.5 3.5 0 017 0v2.7" />
  </Svg>
);

export const IconUnlock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
    <path d="M8.5 10.5V7.8a3.5 3.5 0 016.6-1.6" />
  </Svg>
);

export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M9.5 7V4.8h5V7" />
    <path d="M6.5 7l1 12.2A1.8 1.8 0 009.3 21h5.4a1.8 1.8 0 001.8-1.8L17.5 7" />
  </Svg>
);

export const IconCopy = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M15 9V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7a2 2 0 002 2h3" />
  </Svg>
);

export const IconUndo = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9h10a5 5 0 010 10H9" />
    <path d="M7.5 5.5L4 9l3.5 3.5" />
  </Svg>
);

export const IconRedo = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 9H10a5 5 0 000 10h5" />
    <path d="M16.5 5.5L20 9l-3.5 3.5" />
  </Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconMinus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
);

export const IconFit = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Svg>
);

export const IconSave = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v11" />
    <path d="M8 10.5l4 4 4-4" />
    <path d="M4 17v2.5A1.5 1.5 0 005.5 21h13a1.5 1.5 0 001.5-1.5V17" />
  </Svg>
);

export const IconFolder = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7.5A1.5 1.5 0 014.5 6h4l2 2.5h7A1.5 1.5 0 0119 10v8a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 013 18z" />
  </Svg>
);

export const IconImage = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2" />
    <circle cx="8.2" cy="9.5" r="1.6" />
    <path d="M3.5 17l5-5 4 4 3-2.5 5 4.5" />
  </Svg>
);

export const IconSparkle = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" />
    <path d="M18.5 16.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" strokeWidth={1.2} />
  </Svg>
);

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5L20 20" />
  </Svg>
);
