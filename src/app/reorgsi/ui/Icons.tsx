/* Stroke icons on a 24-unit grid, drawn for this project. The four glyphs of
   the business — house, key, person, coin — are shared with the intro orb,
   which draws the same paths on canvas. */

export const GLYPHS = {
  house: "M4 11.2 12 4.5l8 6.7M6.5 9.4V19h11V9.4M10 19v-5h4v5",
  key: "M14.8 9.2a4.2 4.2 0 1 0-1.6 3.3L19 18.3M16.6 15.9l1.8-1.8M14.6 13.9l1.6-1.6",
  person: "M12 11.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8ZM5.5 19.5c.8-3.5 3.4-5.4 6.5-5.4s5.7 1.9 6.5 5.4",
  coin: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM14.8 9.3a3.4 3.4 0 1 0 0 5.4M8.4 11h4.8M8.4 13h4.8",
} as const;

type P = { size?: number; className?: string };

function Svg({ size = 20, className, children }: P & { children: React.ReactNode }) {
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
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconHouse = (p: P) => (
  <Svg {...p}>
    <path d={GLYPHS.house} />
  </Svg>
);
export const IconKey = (p: P) => (
  <Svg {...p}>
    <path d={GLYPHS.key} />
  </Svg>
);
export const IconPeople = (p: P) => (
  <Svg {...p}>
    <path d={GLYPHS.person} />
  </Svg>
);
export const IconCoin = (p: P) => (
  <Svg {...p}>
    <path d={GLYPHS.coin} />
  </Svg>
);
export const IconHome = (p: P) => (
  <Svg {...p}>
    <path d="M4 5h7v7H4zM13 5h7v4h-7zM13 11h7v8h-7zM4 14h7v5H4z" />
  </Svg>
);
export const IconChart = (p: P) => (
  <Svg {...p}>
    <path d="M4 20h16M7 16v-4M11.5 16V8M16 16v-6.5M19 5.5l-4 3-3.5-2.5L6 9.5" />
  </Svg>
);
export const IconLedger = (p: P) => (
  <Svg {...p}>
    <path d="M6 3.5h12v17H6zM9 8h6M9 12h6M9 16h3" />
  </Svg>
);
export const IconSettings = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4" />
  </Svg>
);
export const IconMenu = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);
export const IconClose = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);
export const IconPlus = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const IconUpload = (p: P) => (
  <Svg {...p}>
    <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 15v4.5h14V15" />
  </Svg>
);
export const IconFile = (p: P) => (
  <Svg {...p}>
    <path d="M7 3.5h7l4 4v13H7zM14 3.5v4h4" />
  </Svg>
);
export const IconExternal = (p: P) => (
  <Svg {...p}>
    <path d="M14 4.5h5.5V10M19.5 4.5 11 13M17 14v5.5H5V7.5h5.5" />
  </Svg>
);
export const IconChevronLeft = (p: P) => (
  <Svg {...p}>
    <path d="m15 5-7 7 7 7" />
  </Svg>
);
export const IconChevronRight = (p: P) => (
  <Svg {...p}>
    <path d="m9 5 7 7-7 7" />
  </Svg>
);
export const IconDownload = (p: P) => (
  <Svg {...p}>
    <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />
  </Svg>
);
export const IconTrash = (p: P) => (
  <Svg {...p}>
    <path d="M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7" />
  </Svg>
);
export const IconSearch = (p: P) => (
  <Svg {...p}>
    <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM16 16l4 4" />
  </Svg>
);

/** Brand mark: a roof line held inside an orbit — the house at the centre of
 *  the team's work. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="18.5" fill="#152d35" stroke="#345b63" />
      <ellipse cx="20" cy="20" rx="17" ry="7" fill="none" stroke="#d4ecdd" strokeOpacity="0.35" transform="rotate(-24 20 20)" />
      <path d="M11.5 21.5 20 13.5l8.5 8M14 19.6V27h12v-7.4" fill="none" stroke="#d4ecdd" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="33" cy="13" r="2.2" fill="#d4ecdd" />
    </svg>
  );
}
