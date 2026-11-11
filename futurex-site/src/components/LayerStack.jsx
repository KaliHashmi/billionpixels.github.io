// The four service layers drawn as an isometric stack: the network at the bottom, applications on top.
// Each plate's top face is a unit square mapped onto the isometric diamond, so the drawings on it
// (fibre runs, rack rows, a neural network, app screens) sit in true perspective.

const W = 420;
const HALF_W = 150;
const HALF_H = 75;
const DEPTH = 14;
const GAP = 140;
const BASE_Y = 500;

const cyOf = (i) => BASE_Y - i * GAP;

function Telecom() {
  const rows = [0.2, 0.35, 0.5, 0.65, 0.8];
  return (
    <g>
      {rows.map((y, k) => (
        <path key={y} d={`M0.08 ${y} C0.35 ${y - 0.12} 0.62 ${y + 0.12} 0.92 ${y}`} className="ln" style={{ '--k': k }} />
      ))}
      <path d="M0.5 0.08 L0.5 0.92" className="ln faint" />
      {rows.map((y) => (
        <circle key={`n${y}`} cx="0.5" cy={y} r="0.022" className="node" />
      ))}
    </g>
  );
}

function DataCentre() {
  const racks = [];
  for (let r = 0; r < 4; r += 1)
    for (let c = 0; c < 6; c += 1)
      racks.push(<rect key={`${r}-${c}`} x={0.12 + r * 0.2} y={0.1 + c * 0.135} width="0.14" height="0.095" className="rack" />);
  return <g>{racks}</g>;
}

function Ai() {
  const cols = [
    [0.25, 0.5, 0.75],
    [0.16, 0.39, 0.61, 0.84],
    [0.33, 0.67],
  ];
  const xs = [0.18, 0.5, 0.82];
  const edges = [];
  cols.forEach((col, ci) => {
    if (ci === cols.length - 1) return;
    col.forEach((y1) => cols[ci + 1].forEach((y2) => edges.push([xs[ci], y1, xs[ci + 1], y2])));
  });
  return (
    <g>
      {edges.map(([x1, y1, x2, y2]) => (
        <line key={`${x1}${y1}${x2}${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} className="ln faint" />
      ))}
      {cols.map((col, ci) => col.map((y) => <circle key={`${ci}-${y}`} cx={xs[ci]} cy={y} r="0.035" className="node" />))}
    </g>
  );
}

function Apps() {
  return (
    <g>
      {[0.14, 0.4, 0.66].map((x) => (
        <g key={x}>
          <rect x={x} y="0.16" width="0.2" height="0.68" rx="0.04" className="screen" />
          <path d={`M${x + 0.04} 0.3 H${x + 0.16} M${x + 0.04} 0.4 H${x + 0.13} M${x + 0.04} 0.5 H${x + 0.15}`} className="ln faint" />
        </g>
      ))}
    </g>
  );
}

const DRAWINGS = [Telecom, DataCentre, Ai, Apps];

export default function LayerStack({ items, active, label }) {
  return (
    <svg className="stack" viewBox={`0 -24 ${W} 630`} role="img" aria-label={label}>
      <path d={`M${W / 2} ${cyOf(0)} V${cyOf(3)}`} className="spine" />
      {items.map((item, i) => {
        const cy = cyOf(i);
        const top = cy - HALF_H;
        const x0 = W / 2 - HALF_W;
        const x1 = W / 2 + HALF_W;
        const Drawing = DRAWINGS[i];
        return (
          <g key={item.id} className={`plate${i === active ? ' is-active' : ''}${i > active ? ' is-above' : ''}`}>
            <polygon className="side l" points={`${x0},${cy} ${W / 2},${cy + HALF_H} ${W / 2},${cy + HALF_H + DEPTH} ${x0},${cy + DEPTH}`} />
            <polygon className="side r" points={`${x1},${cy} ${W / 2},${cy + HALF_H} ${W / 2},${cy + HALF_H + DEPTH} ${x1},${cy + DEPTH}`} />
            <polygon className="face" points={`${W / 2},${top} ${x1},${cy} ${W / 2},${cy + HALF_H} ${x0},${cy}`} />
            <g transform={`matrix(${HALF_W} ${HALF_H} ${-HALF_W} ${HALF_H} ${W / 2} ${top})`} className="art">
              <Drawing />
            </g>
            <text x={x1 + 10} y={cy + 5} className="code">
              {item.code}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
