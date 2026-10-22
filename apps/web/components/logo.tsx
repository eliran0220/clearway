import { useId } from 'react';

// The Clearway mark: a rising flight path whose arrowhead is a plane (growth in air traffic).
// The same drawing is the browser-tab icon in app/icon.svg.
export const PLANE_PATH =
  'M0 -20 C1.6 -20 2.2 -17.5 2.2 -15 L2.2 -4.5 L19 5.5 L19 9 L2.2 4 L2.2 13 L7.5 17 L7.5 19.5 L0 17.5 L-7.5 19.5 L-7.5 17 L-2.2 13 L-2.2 4 L-19 9 L-19 5.5 L-2.2 -4.5 L-2.2 -15 C-2.2 -17.5 -1.6 -20 0 -20 Z';

export function LogoMark({ className }: { className?: string }) {
  // useId can contain characters that are not safe inside url(#...), so keep letters, digits, - and _.
  const gradient = `cw-logo-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id={gradient} x1="0" y1="64" x2="64" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1e2a78" />
          <stop offset=".55" stopColor="#4f46e5" />
          <stop offset="1" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${gradient})`} />
      <path d="M11 48 L23 37 L30 42 L36.5 35" fill="none" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" opacity=".9" />
      <g transform="translate(46 23.5) rotate(45) scale(.68)">
        <path d={PLANE_PATH} fill="#fff" />
      </g>
    </svg>
  );
}
