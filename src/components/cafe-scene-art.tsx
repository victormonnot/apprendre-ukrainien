import type { ReactNode } from "react";
import type { SceneRoleId } from "@/lib/scene-types";

/* Every layer shares this viewBox and is cropped the same way, so they stay aligned. */
const VIEW_BOX = "0 0 1600 900";

export type MouthRig = {
  x: number;
  y: number;
  half: number;
  smile: number;
  open: number;
};
export type CharacterRig = {
  mouth: MouthRig;
  neck: { x: number; y: number };
  head: { x: number; top: number };
};

export const characterRigs: Record<SceneRoleId, CharacterRig> = {
  anna: {
    mouth: { x: 512, y: 494, half: 15, smile: 6, open: 22 },
    neck: { x: 504, y: 528 },
    head: { x: 506, top: 322 },
  },
  maxime: {
    mouth: { x: 1092, y: 496, half: 16, smile: 5, open: 22 },
    neck: { x: 1096, y: 528 },
    head: { x: 1098, top: 318 },
  },
};

const round = (value: number) => Math.round(value * 10) / 10;

/** Lips as one filled lens: a smile line at rest, an open mouth when loud. */
export function mouthPath({ x, y, half, smile, open }: MouthRig, level = 0) {
  const gap = open * level;
  const width = half * (1 - 0.18 * level);
  return `M${round(x - width)} ${y}Q${x} ${round(y - gap * 0.25)} ${round(x + width)} ${y}Q${x} ${round(y + smile + gap)} ${round(x - width)} ${y}Z`;
}
export function teethPath({ x, y, half, open }: MouthRig, level = 0) {
  const gap = open * level;
  const width = Math.max(0, half * (1 - 0.18 * level) - 3);
  return `M${round(x - width)} ${y + 0.5}Q${x} ${round(y - gap * 0.25 + 0.5)} ${round(x + width)} ${y + 0.5}Q${x} ${round(y + gap * 0.32)} ${round(x - width)} ${y + 0.5}Z`;
}

function along(
  [x0, y0]: [number, number],
  [x1, y1]: [number, number],
  [x2, y2]: [number, number],
  count: number,
) {
  return Array.from({ length: count }, (_, index) => {
    const t = (index + 0.5) / count;
    const u = 1 - t;
    return [
      round(u * u * x0 + 2 * u * t * x1 + t * t * x2),
      round(u * u * y0 + 2 * u * t * y1 + t * t * y2),
    ] as const;
  });
}
const garlands = [
  {
    path: "M30 104Q290 222 548 116",
    points: along([30, 104], [290, 222], [548, 116], 9),
  },
  {
    path: "M1052 116Q1310 222 1570 104",
    points: along([1052, 116], [1310, 222], [1570, 104], 9),
  },
];
const bulbs = garlands.flatMap((garland) => garland.points);

function Layer({ name, children }: { name: string; children: ReactNode }) {
  return (
    <svg
      className={`cafe-layer cafe-layer-${name}`}
      viewBox={VIEW_BOX}
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const windowPath = "M560 600V262A240 122 0 0 1 1040 262V600Z";

function Leaf({
  x,
  y,
  angle,
  size = 1,
  fill,
  vein,
}: {
  x: number;
  y: number;
  angle: number;
  size?: number;
  fill: string;
  vein?: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${size})`}>
      <path
        d="M0 0C-58 -18 -92 -86 -54 -138C-22 -176 42 -172 72 -130C104 -86 70 -18 0 0Z"
        fill={fill}
      />
      {vein && (
        <path
          d="M0 -4Q6 -70 10 -150M2 -40L-40 -70M4 -70L-34 -112M3 -46L46 -78M6 -84L46 -118"
          stroke={vein}
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
        />
      )}
    </g>
  );
}

function Kyiv() {
  return (
    <g>
      <path
        className="cafe-city"
        d="M560 600V488H588V470H604V500H626V458H650V496H676V478H700V510H960V470H986V492H1004V452H1026V482H1040V600Z"
      />
      <g className="cafe-landmark">
        <rect x="606" y="372" width="52" height="230" />
        <rect x="614" y="318" width="36" height="56" />
        <rect x="620" y="306" width="24" height="14" />
        <rect x="770" y="430" width="190" height="172" />
        <path d="M770 430L865 394L960 430Z" />
        <rect x="842" y="352" width="46" height="60" />
        <rect x="786" y="396" width="24" height="36" />
        <rect x="920" y="396" width="24" height="36" />
      </g>
      <g stroke="#f6f3ec" fill="none">
        <path d="M606 372H658M614 318H650M770 430H960" strokeWidth="4" />
        <path
          d="M620 400V590M632 400V590M644 400V590M792 440V600M830 440V600M900 440V600M938 440V600M842 360H888"
          strokeWidth="2.5"
          opacity=".75"
        />
      </g>
      <g fill="#4d6f8b">
        <rect x="620" y="330" width="8" height="26" rx="4" />
        <rect x="636" y="330" width="8" height="26" rx="4" />
        <rect x="806" y="464" width="12" height="30" rx="6" />
        <rect x="846" y="464" width="12" height="30" rx="6" />
        <rect x="872" y="464" width="12" height="30" rx="6" />
        <rect x="912" y="464" width="12" height="30" rx="6" />
        <rect x="859" y="372" width="12" height="26" rx="6" />
      </g>
      <g className="cafe-domes">
        <path d="M632 268Q616 284 616 296Q616 310 632 310Q648 310 648 296Q648 284 632 268Z" />
        <path d="M865 270Q836 300 836 324Q836 354 865 354Q894 354 894 324Q894 300 865 270Z" />
        <path d="M798 352Q782 368 782 382Q782 398 798 398Q814 398 814 382Q814 368 798 352Z" />
        <path d="M932 352Q916 368 916 382Q916 398 932 398Q948 398 948 382Q948 368 932 352Z" />
      </g>
      <g fill="#c99331" opacity=".55">
        <path d="M632 268Q648 284 648 296Q648 310 632 310Z" />
        <path d="M865 270Q894 300 894 324Q894 354 865 354Z" />
        <path d="M798 352Q814 368 814 382Q814 398 798 398Z" />
        <path d="M932 352Q948 368 948 382Q948 398 932 398Z" />
      </g>
      <path
        d="M632 246V270M626 254H638M865 234V272M857 246H873M798 334V354M793 341H803M932 334V354M927 341H937"
        stroke="#e2b04a"
        strokeWidth="3"
      />
      <path
        d="M626 282Q621 292 622 302M856 290Q846 306 848 330"
        stroke="#fbe29a"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
      <g className="cafe-trees">
        <circle cx="586" cy="556" r="48" />
        <circle cx="652" cy="582" r="42" />
        <circle cx="724" cy="566" r="44" />
        <circle cx="796" cy="590" r="36" />
        <circle cx="862" cy="598" r="30" />
        <circle cx="930" cy="584" r="36" />
        <circle cx="992" cy="558" r="50" />
        <circle cx="1034" cy="586" r="34" />
      </g>
      <g className="cafe-trees-light">
        <circle cx="574" cy="540" r="22" />
        <circle cx="714" cy="550" r="20" />
        <circle cx="980" cy="540" r="24" />
      </g>
    </g>
  );
}

export function CafeBackLayer() {
  return (
    <Layer name="back">
      <defs>
        <linearGradient id="cafe-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="cafe-wall-top" />
          <stop offset="1" className="cafe-wall-bottom" />
        </linearGradient>
        <linearGradient id="cafe-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="cafe-sky-top" />
          <stop offset="1" className="cafe-sky-bottom" />
        </linearGradient>
        <radialGradient id="cafe-sun">
          <stop offset="0" className="cafe-sun-glow" stopOpacity=".9" />
          <stop offset="1" className="cafe-sun-glow" stopOpacity="0" />
        </radialGradient>
        <pattern
          id="cafe-tiles"
          width="64"
          height="64"
          patternUnits="userSpaceOnUse"
        >
          <rect width="64" height="64" fill="#f6efe4" />
          <path
            d="M0 1H64M0 33H64M1 0V32M33 32V64"
            stroke="#e1d3c0"
            strokeWidth="2"
          />
        </pattern>
        <linearGradient id="cafe-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9a6a47" />
          <stop offset="1" stopColor="#6a442e" />
        </linearGradient>
        <linearGradient id="cafe-chrome" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#a7afb5" />
          <stop offset=".45" stopColor="#f0f2f3" />
          <stop offset="1" stopColor="#8f989f" />
        </linearGradient>
        <clipPath id="cafe-window-clip">
          <path d={windowPath} />
        </clipPath>
      </defs>

      <rect width="1600" height="900" fill="url(#cafe-wall)" />
      <rect y="600" width="1600" height="300" fill="url(#cafe-tiles)" />
      <rect y="588" width="1600" height="16" fill="#b8895f" />
      <rect y="604" width="1600" height="8" fill="#5a3a24" opacity=".08" />

      <g clipPath="url(#cafe-window-clip)">
        <rect x="560" y="130" width="480" height="480" fill="url(#cafe-sky)" />
        <circle cx="968" cy="214" r="170" fill="url(#cafe-sun)" />
        <circle cx="968" cy="214" r="26" className="cafe-sun-disc" />
        <g className="cafe-clouds" fill="#fff">
          <g opacity=".92">
            <ellipse cx="650" cy="236" rx="52" ry="15" />
            <ellipse cx="676" cy="224" rx="30" ry="18" />
            <ellipse cx="628" cy="228" rx="22" ry="12" />
          </g>
          <g opacity=".75">
            <ellipse cx="880" cy="292" rx="62" ry="13" />
            <ellipse cx="906" cy="282" rx="28" ry="14" />
          </g>
        </g>
        <g
          className="cafe-birds"
          fill="none"
          stroke="#3d4f5a"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <path d="M600 250q6-6 12 0q6-6 12 0" />
          <path d="M628 268q5-5 10 0q5-5 10 0" />
        </g>
        <Kyiv />
      </g>
      <path d={windowPath} fill="none" stroke="#2b3632" strokeWidth="12" />
      <path
        d="M720 148V600M880 148V600M564 262H1036M564 430H1036"
        stroke="#2b3632"
        strokeWidth="6"
      />
      <rect x="540" y="594" width="520" height="20" rx="4" fill="#8f6243" />
      <rect
        x="540"
        y="612"
        width="520"
        height="8"
        fill="#3a2516"
        opacity=".1"
      />

      <path d="M634 594L640 560H676L682 594Z" fill="#c0603f" />
      <g className="cafe-sway cafe-sway-sill">
        <path
          d="M658 560Q640 530 626 528Q636 552 658 560ZM658 560Q666 524 688 516Q684 546 658 560ZM658 560Q650 520 660 500Q676 530 658 560Z"
          fill="#5f8a52"
        />
      </g>

      <g className="cafe-cat">
        <g className="cafe-cat-body">
          <ellipse cx="906" cy="574" rx="58" ry="23" fill="#e39a55" />
          <path
            d="M884 554q6 10 2 20M904 551q6 12 2 24M924 552q6 11 2 22"
            stroke="#c4762f"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />
        </g>
        <path
          className="cafe-cat-tail"
          d="M960 584Q984 582 982 562Q980 548 968 552"
          stroke="#e39a55"
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M842 558L838 536L858 552ZM866 552L882 536L882 560Z"
          fill="#e8a560"
        />
        <circle cx="862" cy="572" r="22" fill="#e8a560" />
        <path
          d="M850 574q4 3 8 0M866 574q4 3 8 0"
          stroke="#7a4a26"
          strokeWidth="2.2"
          fill="none"
          strokeLinecap="round"
        />
        <ellipse cx="880" cy="592" rx="13" ry="6" fill="#f2b876" />
      </g>

      <rect x="146" y="186" width="228" height="198" rx="12" fill="#6b4a33" />
      <rect x="158" y="198" width="204" height="174" rx="6" fill="#2f3d38" />
      <text
        x="250"
        y="248"
        textAnchor="middle"
        fill="#f6efe1"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontStyle="italic"
        fontSize="38"
      >
        Кава
      </text>
      <g stroke="#f6efe1" fill="none" strokeLinecap="round">
        <path
          d="M300 222h24v12q-12 11-24 0zM324 224q9 0 7 7"
          strokeWidth="2.5"
          opacity=".85"
        />
        <path
          d="M296 214q3-6 0-10M310 214q3-6 0-10"
          strokeWidth="2"
          opacity=".6"
        />
        <path
          d="M188 266H312"
          strokeWidth="2"
          strokeDasharray="2 8"
          opacity=".6"
        />
        <path
          d="M182 296H262M182 322H246M182 348H272"
          strokeWidth="3"
          opacity=".75"
        />
        <path
          d="M310 296H336M310 322H336M310 348H336"
          strokeWidth="3"
          opacity=".75"
        />
      </g>

      <path d="M-20 560H410V900H-20Z" fill="url(#cafe-wood)" />
      <path
        d="M40 600V900M150 600V900M260 600V900M370 600V900"
        stroke="#5c3b28"
        strokeWidth="3"
        opacity=".45"
      />
      <rect x="-20" y="548" width="440" height="18" rx="5" fill="#4b3123" />
      <path
        d="M36 548H120"
        stroke="#8f6243"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <rect x="56" y="520" width="44" height="24" rx="4" fill="#e7b46d" />
      <path d="M56 530H100" stroke="#fff7ea" strokeWidth="3" />
      <path
        d="M44 546Q44 490 78 490Q112 490 112 546Z"
        fill="#eaf4f5"
        opacity=".5"
        stroke="#c6d7da"
        strokeWidth="2"
      />
      <rect x="160" y="436" width="192" height="18" rx="6" fill="#7d868d" />
      <rect
        x="168"
        y="448"
        width="176"
        height="100"
        rx="12"
        fill="url(#cafe-chrome)"
      />
      <g fill="#fff7ea">
        <rect x="180" y="418" width="24" height="18" rx="5" />
        <rect x="214" y="418" width="24" height="18" rx="5" />
        <rect x="282" y="418" width="24" height="18" rx="5" fill="#c0603f" />
      </g>
      <rect x="196" y="488" width="40" height="12" rx="3" fill="#5f676e" />
      <rect x="276" y="488" width="40" height="12" rx="3" fill="#5f676e" />
      <path
        d="M216 500H184M296 500H328"
        stroke="#2f2a27"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <rect x="176" y="534" width="160" height="10" rx="3" fill="#5f676e" />
      <path d="M206 514H226V524Q216 532 206 524Z" fill="#fff7ea" />
      <circle
        cx="256"
        cy="470"
        r="10"
        fill="#fff"
        stroke="#5f676e"
        strokeWidth="3"
      />
      <path d="M256 470L262 465" stroke="#c0603f" strokeWidth="2" />

      <path d="M800 0V166" stroke="#2b2523" strokeWidth="3" />
      <path d="M752 214Q756 168 800 166Q844 168 848 214Z" fill="#2b3632" />
      <path
        d="M746 214H854"
        stroke="#1d2522"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <ellipse cx="800" cy="220" rx="18" ry="9" fill="#fff1c6" />

      <rect x="1232" y="192" width="176" height="232" rx="4" fill="#2d2a28" />
      <rect x="1242" y="202" width="156" height="212" fill="#f7f0e3" />
      <path d="M1254 216H1386M1254 400H1386" stroke="#b8322a" strokeWidth="4" />
      {[0, 1, 2, 3].flatMap((row) =>
        [0, 1, 2, 3].map((column) => {
          const x = 1266 + column * 36;
          const y = 248 + row * 42;
          return (
            <g key={`${row}-${column}`}>
              <path
                d={`M${x} ${y - 13}L${x + 13} ${y}L${x} ${y + 13}L${x - 13} ${y}Z`}
                fill={row % 2 ? "#2d2a28" : "#b8322a"}
              />
              <rect x={x - 3} y={y - 3} width="6" height="6" fill="#f7f0e3" />
            </g>
          );
        }),
      )}

      <rect x="1286" y="476" width="200" height="12" rx="3" fill="#8f6243" />
      <path d="M1306 476L1310 448H1342L1346 476Z" fill="#c0603f" />
      <path d="M1420 476L1424 452H1452L1456 476Z" fill="#f1e6d6" />
      <g fill="#6d9a58">
        <circle cx="1430" cy="446" r="9" />
        <circle cx="1446" cy="444" r="8" />
        <circle cx="1438" cy="436" r="8" />
      </g>
      <g className="cafe-sway cafe-sway-shelf">
        <path
          d="M1318 452Q1296 520 1312 606M1332 452Q1356 500 1350 560"
          stroke="#4f7a49"
          strokeWidth="2.5"
          fill="none"
        />
        <g fill="#5f8a52">
          {(
            [
              [1312, 470, -30],
              [1302, 500, 20],
              [1302, 532, -20],
              [1306, 566, 25],
              [1312, 598, -10],
              [1340, 470, 30],
              [1350, 500, -15],
              [1352, 532, 20],
            ] as const
          ).map(([x, y, angle]) => (
            <ellipse
              key={`${x}-${y}`}
              cx={x}
              cy={y}
              rx="10"
              ry="14"
              transform={`rotate(${angle} ${x} ${y})`}
            />
          ))}
        </g>
      </g>

      <path d="M1420 900L1408 780H1552L1540 900Z" fill="#c0603f" />
      <rect x="1400" y="772" width="160" height="16" rx="4" fill="#a24b30" />
      <path
        d="M1478 780Q1470 700 1430 620M1482 780Q1500 680 1540 600M1480 780Q1480 690 1478 560"
        stroke="#3f6e48"
        strokeWidth="5"
        fill="none"
      />
      <Leaf
        x={1432}
        y={640}
        angle={-40}
        size={0.95}
        fill="#3f6e48"
        vein="#e9dac5"
      />
      <Leaf
        x={1540}
        y={612}
        angle={30}
        size={1.05}
        fill="#4c7d52"
        vein="#e9dac5"
      />
      <Leaf
        x={1478}
        y={572}
        angle={-4}
        size={0.9}
        fill="#5b8c5b"
        vein="#e9dac5"
      />

      {garlands.map((garland) => (
        <path
          key={garland.path}
          d={garland.path}
          stroke="#4a3a30"
          strokeWidth="2"
          fill="none"
        />
      ))}
      {bulbs.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect
            x={x - 3}
            y={y - 2}
            width="6"
            height="7"
            rx="1.5"
            fill="#4a3a30"
          />
          <ellipse cx={x} cy={y + 11} rx="6" ry="8" fill="#ffe7a6" />
        </g>
      ))}
    </Layer>
  );
}

export function CafeLightLayer() {
  return (
    <Layer name="light">
      <defs>
        <linearGradient id="cafe-shaft" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="cafe-shaft" stopOpacity=".7" />
          <stop offset="1" className="cafe-shaft" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="cafe-window-glow">
          <stop offset="0" className="cafe-shaft" stopOpacity=".55" />
          <stop offset="1" className="cafe-shaft" stopOpacity="0" />
        </radialGradient>
        <filter id="cafe-soft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
      </defs>
      <ellipse
        cx="800"
        cy="380"
        rx="380"
        ry="300"
        fill="url(#cafe-window-glow)"
      />
      <g filter="url(#cafe-soft)" className="cafe-shafts">
        <path d="M900 180L990 192L780 900L560 900Z" fill="url(#cafe-shaft)" />
        <path
          d="M760 214L820 218L520 900L380 900Z"
          fill="url(#cafe-shaft)"
          opacity=".65"
        />
        <path
          d="M1008 272L1036 278L910 900L820 900Z"
          fill="url(#cafe-shaft)"
          opacity=".55"
        />
      </g>
    </Layer>
  );
}

const dust: [number, number, number][] = [
  [640, 640, 0],
  [700, 520, -2.5],
  [760, 760, -5],
  [820, 600, -1],
  [860, 700, -6.5],
  [590, 780, -3.5],
  [920, 480, -8],
  [680, 700, -4.5],
  [740, 420, -7],
  [880, 380, -2],
  [520, 700, -6],
  [960, 640, -9],
];

export function CafeGlowLayer() {
  return (
    <Layer name="glow">
      <defs>
        <radialGradient id="cafe-bulb">
          <stop offset="0" stopColor="#ffd98a" stopOpacity=".9" />
          <stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="cafe-spot">
          <stop offset="0" className="cafe-spot-color" stopOpacity=".5" />
          <stop offset="1" className="cafe-spot-color" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse
        className="cafe-lamp-glow"
        cx="800"
        cy="236"
        rx="240"
        ry="170"
        fill="url(#cafe-bulb)"
      />
      <ellipse
        className="cafe-spot"
        cx="800"
        cy="470"
        rx="250"
        ry="290"
        fill="url(#cafe-spot)"
      />
      {bulbs.map(([x, y], index) => (
        <circle
          key={`${x}-${y}`}
          className="cafe-twinkle"
          cx={x}
          cy={y + 11}
          r="28"
          fill="url(#cafe-bulb)"
          style={{ animationDelay: `${-(index * 0.37) % 3}s` }}
        />
      ))}
      <g className="cafe-dust">
        {dust.map(([x, y, delay]) => (
          <circle
            key={`${x}-${y}`}
            cx={x}
            cy={y}
            r={x % 3 ? 2.5 : 3.5}
            style={{ animationDelay: `${delay}s` }}
          />
        ))}
      </g>
    </Layer>
  );
}

function Anna() {
  const rig = characterRigs.anna;
  return (
    <g className="cafe-rig cafe-rig-anna" data-rig="anna">
      <g className="cafe-rig-lean">
        <g className="cafe-rig-breath">
          <g data-rig-part="head">
            <g className="cafe-rig-nod">
              <path
                d="M420 450Q408 336 504 322Q604 330 594 452L604 548Q578 566 556 540H452Q430 566 404 548Z"
                fill="#3b2620"
              />
            </g>
          </g>
          <path
            d="M352 900L360 690Q366 590 430 562Q470 546 504 546Q538 546 578 562Q642 590 648 690L656 900Z"
            fill="url(#cafe-anna-sweater)"
          />
          <path
            d="M578 564Q636 592 644 690"
            stroke="#e48a63"
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
            opacity=".75"
          />
          <path
            d="M420 640Q426 760 418 900M470 610Q478 760 470 900M540 610Q534 760 540 900M590 640Q584 760 592 900"
            stroke="#9c4630"
            strokeWidth="3"
            fill="none"
            opacity=".35"
          />
          <path d="M482 486H526V560Q504 572 482 560Z" fill="#e3a988" />
          <path
            d="M470 554Q504 580 538 554"
            stroke="#a14a2f"
            strokeWidth="10"
            fill="none"
            strokeLinecap="round"
          />
          <g data-rig-part="head">
            <g className="cafe-rig-nod">
              <path
                d="M432 432Q432 346 506 344Q578 346 578 432Q578 500 536 522Q506 534 476 522Q432 500 432 432Z"
                fill="#f2c4a2"
              />
              <path
                d="M432 432Q432 346 506 344Q464 362 454 432Q450 492 476 522Q432 500 432 432Z"
                fill="#dfa184"
                opacity=".55"
              />
              <ellipse
                cx="468"
                cy="478"
                rx="13"
                ry="8"
                fill="#ec8f7a"
                opacity=".35"
              />
              <ellipse
                cx="552"
                cy="478"
                rx="13"
                ry="8"
                fill="#ec8f7a"
                opacity=".35"
              />
              <g className="cafe-eyes">
                <ellipse cx="484" cy="446" rx="6.5" ry="8.5" fill="#2b1d18" />
                <ellipse cx="532" cy="446" rx="6.5" ry="8.5" fill="#2b1d18" />
                <circle cx="486.5" cy="442.5" r="2" fill="#fff" />
                <circle cx="534.5" cy="442.5" r="2" fill="#fff" />
              </g>
              <path
                d="M477 440l-6-4M539 440l6-4"
                stroke="#2b1d18"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <g data-rig-part="brows">
                <path
                  d="M470 420Q484 412 498 418M520 418Q534 412 548 420"
                  stroke="#3b2620"
                  strokeWidth="4.5"
                  fill="none"
                  strokeLinecap="round"
                />
              </g>
              <path
                d="M514 452Q522 468 510 474"
                stroke="#cf8f78"
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
              />
              <path
                data-rig-part="mouth"
                d={mouthPath(rig.mouth)}
                fill="#6e2c27"
              />
              <path
                data-rig-part="teeth"
                d={teethPath(rig.mouth)}
                fill="#fffaf3"
              />
              <path
                d="M428 432Q422 340 506 330Q590 336 584 426Q574 392 542 378Q512 400 470 398Q446 404 428 432Z"
                fill="#3b2620"
              />
              <path
                d="M432 404Q414 470 428 548Q446 520 450 470Q452 430 446 404Z"
                fill="#3b2620"
              />
              <path
                d="M580 406Q598 470 584 548Q566 520 562 470Q560 430 566 408Z"
                fill="#3b2620"
              />
              <path
                d="M548 340Q590 358 592 420"
                stroke="#7a4c3a"
                strokeWidth="6"
                fill="none"
                strokeLinecap="round"
                opacity=".8"
              />
              <rect
                x="546"
                y="380"
                width="28"
                height="9"
                rx="4"
                fill="#e3b23c"
                transform="rotate(-24 560 384)"
              />
            </g>
          </g>
        </g>
      </g>
    </g>
  );
}

function Maxime() {
  const rig = characterRigs.maxime;
  return (
    <g className="cafe-rig cafe-rig-maxime" data-rig="maxime">
      <g className="cafe-rig-lean">
        <g className="cafe-rig-breath">
          <path
            d="M952 900L960 690Q966 590 1030 562Q1070 546 1096 546Q1130 546 1170 562Q1234 590 1240 690L1248 900Z"
            fill="url(#cafe-maxime-sweater)"
          />
          <path
            d="M1028 564Q970 592 962 690"
            stroke="#86b6a6"
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
            opacity=".8"
          />
          <path d="M1074 486H1118V560Q1096 572 1074 560Z" fill="#c98d6c" />
          <path d="M1066 550L1096 604L1126 550Z" fill="#f6f1e8" />
          <path
            d="M1066 550L1088 576L1078 546ZM1126 550L1104 576L1114 546Z"
            fill="#e7dfd2"
          />
          <path
            d="M1062 548L1096 610L1130 548"
            stroke="#3c6c5f"
            strokeWidth="9"
            fill="none"
            strokeLinejoin="round"
          />
          <g data-rig-part="head">
            <g className="cafe-rig-nod">
              <ellipse cx="1026" cy="454" rx="9" ry="16" fill="#cb8f6d" />
              <ellipse cx="1168" cy="454" rx="10" ry="17" fill="#cb8f6d" />
              <path
                d="M1024 432Q1024 346 1096 344Q1168 346 1168 432Q1168 498 1132 522Q1096 538 1060 522Q1024 498 1024 432Z"
                fill="#dca27f"
              />
              <path
                d="M1168 432Q1168 346 1096 344Q1138 362 1148 432Q1152 492 1126 522Q1168 498 1168 432Z"
                fill="#c48463"
                opacity=".3"
              />
              <path
                d="M1036 470Q1040 522 1096 532Q1152 522 1158 470Q1150 508 1096 514Q1044 508 1036 470Z"
                fill="#7d4f37"
                opacity=".2"
              />
              <g className="cafe-eyes">
                <ellipse cx="1072" cy="448" rx="6.5" ry="8.5" fill="#2b1d18" />
                <ellipse cx="1120" cy="448" rx="6.5" ry="8.5" fill="#2b1d18" />
                <circle cx="1069.5" cy="444.5" r="2" fill="#fff" />
                <circle cx="1117.5" cy="444.5" r="2" fill="#fff" />
              </g>
              <g data-rig-part="brows">
                <path
                  d="M1056 418Q1070 410 1086 416M1106 416Q1122 410 1136 418"
                  stroke="#3a2819"
                  strokeWidth="6"
                  fill="none"
                  strokeLinecap="round"
                />
              </g>
              <path
                d="M1086 452Q1078 468 1090 474"
                stroke="#b77a5c"
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
              />
              <path
                data-rig-part="mouth"
                d={mouthPath(rig.mouth)}
                fill="#6e2c27"
              />
              <path
                data-rig-part="teeth"
                d={teethPath(rig.mouth)}
                fill="#fffaf3"
              />
              <g stroke="#2b2522" strokeWidth="4" fill="#fff" fillOpacity=".12">
                <circle cx="1072" cy="448" r="21" />
                <circle cx="1120" cy="448" r="21" />
              </g>
              <path
                d="M1093 446Q1096 441 1099 446M1141 444L1166 440M1051 444L1030 440"
                stroke="#2b2522"
                strokeWidth="4"
                fill="none"
                strokeLinecap="round"
              />
              <path
                d="M1022 436Q1010 356 1068 336Q1098 314 1140 330Q1184 348 1174 428Q1166 398 1148 388Q1114 400 1078 386Q1046 398 1032 414Z"
                fill="#46301f"
              />
              <path
                d="M1046 352Q1072 330 1104 330"
                stroke="#71503a"
                strokeWidth="6"
                fill="none"
                strokeLinecap="round"
              />
            </g>
          </g>
        </g>
      </g>
    </g>
  );
}

export function CafeCastLayer() {
  return (
    <Layer name="cast">
      <defs>
        <linearGradient id="cafe-anna-sweater" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#a34c32" />
          <stop offset="1" stopColor="#cd6844" />
        </linearGradient>
        <linearGradient id="cafe-maxime-sweater" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5f9383" />
          <stop offset="1" stopColor="#3c6a5d" />
        </linearGradient>
        <radialGradient id="cafe-marble" cx=".42" cy=".3" r=".75">
          <stop offset="0" stopColor="#fcf9f4" />
          <stop offset="1" stopColor="#e5dbcd" />
        </radialGradient>
      </defs>
      <Anna />
      <Maxime />

      <path d="M786 760H814L822 900H778Z" fill="#2e2a28" />
      <ellipse cx="800" cy="744" rx="292" ry="46" fill="#c7b7a2" />
      <ellipse cx="800" cy="734" rx="292" ry="44" fill="url(#cafe-marble)" />
      <path
        d="M560 742Q640 716 720 740T880 730Q960 724 1040 744"
        stroke="#d8ccbb"
        strokeWidth="2"
        fill="none"
        opacity=".8"
      />
      <path
        d="M512 730A292 44 0 0 1 1088 730"
        stroke="#fff"
        strokeWidth="3"
        fill="none"
        opacity=".55"
      />

      <path
        d="M598 750L680 742L702 764L616 772Z"
        fill="#fffaf0"
        stroke="#e1d3c0"
        strokeWidth="2"
      />
      <path
        d="M624 752H668M626 760H660"
        stroke="#c4b29b"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <ellipse cx="800" cy="762" rx="42" ry="9" fill="#efe6da" />
      <ellipse cx="800" cy="760" rx="40" ry="7" fill="#fffaf2" />
      <path
        d="M768 756Q800 726 832 756Q816 748 800 750Q784 748 768 756Z"
        fill="#d8914a"
      />
      <path
        d="M786 742L790 754M800 738V752M814 742L810 754"
        stroke="#b4702f"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      <path
        d="M800 690Q796 658 788 632M800 690Q804 660 812 640M800 690Q800 664 800 646"
        stroke="#5b7f4f"
        strokeWidth="2.5"
        fill="none"
      />
      <g fill="#f2c14e">
        {[0, 72, 144, 216, 288].map((angle) => (
          <ellipse
            key={angle}
            cx="788"
            cy="620"
            rx="4"
            ry="7"
            transform={`rotate(${angle} 788 627)`}
          />
        ))}
      </g>
      <circle cx="788" cy="627" r="4" fill="#8a5a2b" />
      <circle cx="813" cy="636" r="7" fill="#4f7cc4" />
      <circle cx="813" cy="636" r="3" fill="#2f5390" />
      <circle cx="800" cy="644" r="4" fill="#fff8ec" />
      <path
        d="M790 732Q784 712 792 702L794 684H806L808 702Q816 712 810 732Z"
        fill="#cfe4e4"
        opacity=".85"
      />
      <path d="M790 716H810" stroke="#a9cccc" strokeWidth="2" />

      <g className="cafe-rig cafe-rig-anna">
        <g className="cafe-rig-lean">
          <path
            d="M600 588Q626 664 664 714"
            stroke="#b85a3b"
            strokeWidth="42"
            fill="none"
            strokeLinecap="round"
          />
          <ellipse cx="678" cy="718" rx="19" ry="13" fill="#f2c4a2" />
          <ellipse cx="688" cy="708" rx="8" ry="6" fill="#e8b493" />
        </g>
      </g>
      <g className="cafe-rig cafe-rig-maxime">
        <g className="cafe-rig-lean">
          <path
            d="M1000 588Q974 664 936 714"
            stroke="#4b7d6e"
            strokeWidth="42"
            fill="none"
            strokeLinecap="round"
          />
          <ellipse cx="922" cy="718" rx="19" ry="13" fill="#dca27f" />
          <ellipse cx="912" cy="708" rx="8" ry="6" fill="#cd9271" />
        </g>
      </g>

      {(
        [
          [712, -1],
          [888, 1],
        ] as const
      ).map(([x, side]) => (
        <g key={x}>
          <ellipse cx={x} cy="728" rx="46" ry="10" fill="#e9dfd1" />
          <ellipse cx={x} cy="726" rx="46" ry="8" fill="#fbf6ee" />
          <path
            d={`M${x + side * 30} 702Q${x + side * 46} 702 ${x + side * 44} 712Q${x + side * 42} 720 ${x + side * 28} 718`}
            stroke="#fffaf2"
            strokeWidth="5"
            fill="none"
          />
          <path
            d={`M${x - 32} 696H${x + 32}Q${x + 32} 728 ${x} 730Q${x - 32} 728 ${x - 32} 696Z`}
            fill="#fffaf2"
          />
          <path
            d={`M${x + side * -26} 700Q${x + side * -24} 722 ${x + side * -6} 728`}
            stroke="#e6dccd"
            strokeWidth="3"
            fill="none"
          />
          <ellipse cx={x} cy="696" rx="32" ry="8" fill="#f1e9de" />
          <ellipse cx={x} cy="697" rx="27" ry="6" fill="#b9814f" />
          <path d={`M${x - 6} 695q3-4 6 0q3-4 6 0l-6 5z`} fill="#fff4e4" />
        </g>
      ))}
      <g className="cafe-steam">
        <path d="M704 680Q694 664 704 648Q714 632 704 616" />
        <path d="M722 676Q714 664 722 652" />
        <path d="M880 680Q870 664 880 648Q890 632 880 616" />
        <path d="M898 676Q890 664 898 652" />
      </g>
    </Layer>
  );
}

export function CafeFrontLayer() {
  return (
    <Layer name="front">
      <defs>
        <filter id="cafe-depth" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      <g filter="url(#cafe-depth)">
        <Leaf x={70} y={930} angle={-30} size={1.5} fill="#2d4a33" />
        <Leaf x={150} y={940} angle={18} size={1.2} fill="#375a3d" />
        <Leaf x={1520} y={940} angle={32} size={1.45} fill="#2d4a33" />
        <Leaf x={1450} y={950} angle={-12} size={1.1} fill="#375a3d" />
      </g>
    </Layer>
  );
}
