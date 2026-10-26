import React from 'react';
import { type MusicIcon as MusicIconName } from '../core/engine';

// Note head tilted like an engraved one, centered at (9, 17).
const head = (filled: boolean) => (
  <ellipse
    cx="9"
    cy="17"
    rx="4.2"
    ry="3"
    transform="rotate(-20 9 17)"
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth={filled ? 0 : 1.6}
  />
);
const stem = <path d="M12.9 16V3" stroke="currentColor" strokeWidth="1.4" />;
const flag = (y: number) => (
  <path d={`M12.9 ${y}c0 3 4.5 4 4.5 8.5`} fill="none" stroke="currentColor" strokeWidth="1.6" />
);
const dots = (x: number) => (
  <>
    <circle cx={x} cy="9.5" r="1.3" fill="currentColor" />
    <circle cx={x} cy="14.5" r="1.3" fill="currentColor" />
  </>
);

const SHAPES: Record<MusicIconName, React.ReactNode> = {
  whole: (
    <ellipse
      cx="12"
      cy="12"
      rx="5.5"
      ry="3.6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
    />
  ),
  half: (
    <>
      {head(false)}
      {stem}
    </>
  ),
  quarter: (
    <>
      {head(true)}
      {stem}
    </>
  ),
  eighth: (
    <>
      {head(true)}
      {stem}
      {flag(3)}
    </>
  ),
  sixteenth: (
    <>
      {head(true)}
      {stem}
      {flag(3)}
      {flag(7)}
    </>
  ),
  rest: <path d="M10 3l4 5-3 4 4 5c-3-1.5-5 0-3 4-4-3-3-6 0-6l-4-5 3-3.5z" fill="currentColor" />,
  dot: <circle cx="12" cy="12" r="2.6" fill="currentColor" />,
  sharp: (
    <path
      d="M10 4v16M14 4v16M7 10.5l10-2.5M7 16l10-2.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    />
  ),
  flat: (
    <path
      d="M9 3v17c3-2 7-4 7-7 0-2.5-3.5-3.5-7 0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    />
  ),
  natural: (
    <path d="M9 3v14l6-2M15 21V7l-6 2" fill="none" stroke="currentColor" strokeWidth="1.8" />
  ),
  tie: <path d="M4 10c3 6 13 6 16 0" fill="none" stroke="currentColor" strokeWidth="2" />,
  bar: <path d="M12 4v16" stroke="currentColor" strokeWidth="1.8" />,
  doubleBar: <path d="M9 4v16M14.5 4v16" stroke="currentColor" strokeWidth="1.8" />,
  repeatStart: (
    <>
      <path d="M7 4v16" stroke="currentColor" strokeWidth="3" />
      <path d="M11 4v16" stroke="currentColor" strokeWidth="1.4" />
      {dots(15)}
    </>
  ),
  repeatEnd: (
    <>
      {dots(9)}
      <path d="M13 4v16" stroke="currentColor" strokeWidth="1.4" />
      <path d="M17 4v16" stroke="currentColor" strokeWidth="3" />
    </>
  ),
};

/** A music symbol drawn in the current text color, 18px like the UI icons. */
function MusicIcon({ name }: { name: MusicIconName }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      {SHAPES[name]}
    </svg>
  );
}

export default MusicIcon;
