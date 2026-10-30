import { ImageResponse } from "next/og";

/* Home-screen icon for iPhone: the ReorgSI mark (a roof inside an orbit) on
   deep azure. iOS rounds the corners itself, so the square is full-bleed. */

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 50% 30%, #1d3a44 0%, #152d35 45%, #112031 100%)",
        }}
      >
        <svg width="132" height="132" viewBox="0 0 40 40">
          <ellipse cx="20" cy="20" rx="17" ry="7" fill="none" stroke="#d4ecdd" strokeOpacity="0.4" strokeWidth="1.2" transform="rotate(-24 20 20)" />
          <path d="M11.5 21.5 20 13.5l8.5 8M14 19.6V27h12v-7.4" fill="none" stroke="#d4ecdd" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="33" cy="13" r="2.4" fill="#d4ecdd" />
        </svg>
      </div>
    ),
    size,
  );
}
