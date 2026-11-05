import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
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

export const Icons = {
  /** Sending to the other app: an arrow out of a box. */
  Share: (p: IconProps) => (
    <Svg {...p}>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
    </Svg>
  ),
  Import: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 3v10M8 9.5l4 4 4-4" />
      <path d="M4 14.5v4A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-4" />
    </Svg>
  ),
  Undo: (p: IconProps) => (
    <Svg {...p}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </Svg>
  ),
  Redo: (p: IconProps) => (
    <Svg {...p}>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </Svg>
  ),
  Check: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 3 4 6v6c0 4.4 3.4 8.2 8 9 4.6-.8 8-4.6 8-9V6z" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </Svg>
  ),
  Export: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M4 17v3h16v-3" />
    </Svg>
  ),
  Help: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17h.01" />
    </Svg>
  ),
  Eye: (p: IconProps) => (
    <Svg {...p}>
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </Svg>
  ),
  EyeOff: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 3l18 18M10.6 5.6A10 10 0 0 1 12 5.5c6.4 0 10 6.5 10 6.5a17 17 0 0 1-3.3 4M6.5 6.6C3.8 8.3 2 12 2 12s3.6 6.5 10 6.5c1.8 0 3.3-.5 4.6-1.2" />
      <path d="M9.9 9.9a2.8 2.8 0 0 0 4 4" />
    </Svg>
  ),
  Duplicate: (p: IconProps) => (
    <Svg {...p}>
      <rect x="8" y="8" width="12" height="12" rx="1.5" />
      <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
      <path d="M14 11.5v5M11.5 14h5" />
    </Svg>
  ),
  Move: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 3v18M3 12h18" />
      <path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
    </Svg>
  ),
  Mirror: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 3v18" strokeDasharray="2 2" />
      <path d="M9 7 4 17h5zM15 7l5 10h-5z" />
    </Svg>
  ),
  Warning: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 3 2 20h20z" />
      <path d="M12 10v4M12 17h.01" />
    </Svg>
  ),
  Tick: (p: IconProps) => (
    <Svg {...p}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Svg>
  ),
  Cross: (p: IconProps) => (
    <Svg {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  ),
  Plus: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  Laser: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 2v9" />
      <path d="M9 2h6" />
      <path d="M12 11l-1.5 3h3z" />
      <path d="M4 20h16" />
      <path d="M8 17l-2 3M16 17l2 3" strokeDasharray="1.5 1.5" />
    </Svg>
  ),
  Settings: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </Svg>
  ),
  Fit: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </Svg>
  ),
  Select: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5 3l14 8-6 1.5L10 19z" />
    </Svg>
  ),
  Line: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5 19 19 5" />
      <circle cx="5" cy="19" r="1.6" fill="currentColor" />
      <circle cx="19" cy="5" r="1.6" fill="currentColor" />
    </Svg>
  ),
  Rectangle: (p: IconProps) => (
    <Svg {...p}>
      <rect x="4" y="6" width="16" height="12" />
    </Svg>
  ),
  Circle: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    </Svg>
  ),
  Trash: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </Svg>
  ),
  Open: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 6h6l2 2h10v11H3z" />
      <path d="M3 10h18" />
    </Svg>
  ),
  Save: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5 3h11l3 3v15H5z" />
      <path d="M8 3v5h7V3M8 21v-7h8v7" />
    </Svg>
  ),
  New: (p: IconProps) => (
    <Svg {...p}>
      <path d="M14 3H6v18h12V7z" />
      <path d="M14 3v4h4M12 11v6M9 14h6" />
    </Svg>
  ),
  Text: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5 6V4h14v2M12 4v16M9 20h6" />
    </Svg>
  ),
  Rotate: (p: IconProps) => (
    <Svg {...p}>
      <path d="M20 12a8 8 0 1 1-2.3-5.7" />
      <path d="M20 4v5h-5" />
    </Svg>
  ),
  Arrange: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3" y="4" width="7" height="7" rx="1" />
      <rect x="14" y="4" width="7" height="5" rx="1" />
      <rect x="3" y="15" width="10" height="5" rx="1" />
      <rect x="16" y="13" width="5" height="7" rx="1" />
    </Svg>
  ),
  Cut: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="6" cy="6" r="2.5" />
      <path d="M8 7.5 20 17M8 16.5 20 7" />
    </Svg>
  ),
  Score: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 16c3-6 6-6 8 0s5 6 8 0" />
    </Svg>
  ),
  Engrave: (p: IconProps) => (
    <Svg {...p}>
      <rect x="5" y="5" width="14" height="14" rx="1.5" fill="currentColor" stroke="none" />
    </Svg>
  ),
  Up: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </Svg>
  ),
  Down: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 5v14M5 12l7 7 7-7" />
    </Svg>
  ),
  Mountain: (p: IconProps) => (
    <Svg {...p}>
      <path d="M2.5 19.5 9 8.5l4 6.5 2.5-3.5 6 8z" />
      <path d="m6.9 12 2.1-3.5 2.2 3.6-1.3-.8-1 .9-.9-.8z" />
    </Svg>
  ),
  Library: (p: IconProps) => (
    <Svg {...p}>
      <rect x="4" y="4" width="6" height="16" rx="1" />
      <rect x="11" y="4" width="5" height="16" rx="1" />
      <path d="m17 5 3.5 14.5" />
    </Svg>
  ),
  Group: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 2" />
      <rect x="7" y="7" width="6" height="6" rx="1" />
      <circle cx="15" cy="15" r="3" />
    </Svg>
  ),
  Ungroup: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3" y="3" width="8" height="8" rx="1" />
      <circle cx="16.5" cy="16.5" r="4" />
    </Svg>
  ),
  AlignLeft: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 3v18" />
      <rect x="7" y="6" width="12" height="4" rx="1" />
      <rect x="7" y="14" width="7" height="4" rx="1" />
    </Svg>
  ),
  AlignCentre: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 3v18" strokeDasharray="2 2" />
      <rect x="5" y="6" width="14" height="4" rx="1" />
      <rect x="8" y="14" width="8" height="4" rx="1" />
    </Svg>
  ),
  AlignRight: (p: IconProps) => (
    <Svg {...p}>
      <path d="M20 3v18" />
      <rect x="5" y="6" width="12" height="4" rx="1" />
      <rect x="10" y="14" width="7" height="4" rx="1" />
    </Svg>
  ),
  AlignTop: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 4h18" />
      <rect x="6" y="7" width="4" height="12" rx="1" />
      <rect x="14" y="7" width="4" height="7" rx="1" />
    </Svg>
  ),
  AlignMiddle: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 12h18" strokeDasharray="2 2" />
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="8" width="4" height="8" rx="1" />
    </Svg>
  ),
  AlignBottom: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 20h18" />
      <rect x="6" y="5" width="4" height="12" rx="1" />
      <rect x="14" y="10" width="4" height="7" rx="1" />
    </Svg>
  ),
  SpreadX: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 4v16M21 4v16" />
      <rect x="9" y="8" width="6" height="8" rx="1" />
    </Svg>
  ),
  SpreadY: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 3h16M4 21h16" />
      <rect x="8" y="9" width="8" height="6" rx="1" />
    </Svg>
  ),
};
