// Icon tiles in the FutureX profile style: a black tile, white strokes, the accent strokes in steel.
const PATHS = {
  telecom: (
    <>
      <path d="M12 9v12M8.5 21h7M9.5 13.5 12 9l2.5 4.5" />
      <path className="s" d="M7.8 4.8a6 6 0 0 0 0 8.4M16.2 4.8a6 6 0 0 1 0 8.4M10 7a3 3 0 0 0 0 4M14 7a3 3 0 0 1 0 4" />
    </>
  ),
  datacentre: (
    <>
      <rect x="4" y="3.5" width="16" height="7" rx="1.6" />
      <rect x="4" y="13.5" width="16" height="7" rx="1.6" />
      <path className="s" d="M12 7h5M12 17h5M7.5 7h.01M7.5 17h.01" />
    </>
  ),
  ai: (
    <>
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <path className="s" d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" />
      <path d="M10.5 10.5h3v3h-3z" />
    </>
  ),
  apps: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.6" />
      <path className="s" d="M10.5 18h3M9.5 6.5h5" />
    </>
  ),
};

export default function LayerIcon({ id }) {
  return (
    <span className="icon-tile" aria-hidden="true">
      <svg viewBox="0 0 24 24">{PATHS[id]}</svg>
    </span>
  );
}
