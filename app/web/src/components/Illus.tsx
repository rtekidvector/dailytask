/** Hand-drawn flat illustrations (inline SVG, no image files). Palette follows the theme tokens. */
const INK = "#101114", LIME = "#D6F43F", BLUE = "#2F6BFF", SOFT = "#E3EBFF", CANVAS = "#F1F3F7", PINK = "#FF9DBB", AMBER = "#FFB257";

const Spark = ({ x, y, s = 1, c = LIME }: { x: number; y: number; s?: number; c?: string }) => (
  <path transform={`translate(${x} ${y}) scale(${s})`} d="M0-12C1.5-4 4-1.5 12 0 4 1.5 1.5 4 0 12-1.5 4-4 1.5-12 0-4-1.5-1.5-4 0-12Z" fill={c} />
);

/** Sign-in scene: a floating dashboard, checklist card and progress ring on a dark panel. */
export function LoginScene() {
  const bars = [46, 78, 58, 104, 70, 92];
  return (
    <svg className="illo" viewBox="0 0 520 380" role="img" aria-label="Ilustrasi dasbor tugas">
      <circle cx="400" cy="120" r="100" fill={BLUE} opacity=".22" /><circle cx="110" cy="290" r="80" fill={LIME} opacity=".12" />
      <rect x="70" y="60" width="330" height="230" rx="26" fill="#fff" />
      <rect x="92" y="82" width="86" height="12" rx="6" fill={INK} /><rect x="92" y="102" width="56" height="8" rx="4" fill="#C9CFDB" />
      <rect x="318" y="80" width="64" height="26" rx="13" fill={INK} /><rect x="326" y="89" width="30" height="8" rx="4" fill={LIME} />
      {bars.map((h, i) => <g key={i}><rect x={96 + i * 48} y={262 - 128} width="34" height="128" rx="17" fill={CANVAS} /><rect x={96 + i * 48} y={262 - h} width="34" height={h} rx="17" fill={i === 3 ? BLUE : i % 2 ? LIME : "#9DB8FF"} /></g>)}
      <rect x="296" y="196" width="180" height="150" rx="22" fill={INK} stroke="#2a2c33" />
      <rect x="316" y="214" width="70" height="10" rx="5" fill="#fff" />
      {[0, 1, 2].map(i => <g key={i}><circle cx="328" cy={250 + i * 30} r="10" fill={i < 2 ? LIME : "none"} stroke={i < 2 ? "none" : "#6E7482"} strokeWidth="2" />{i < 2 && <path d={`M323 ${250 + i * 30}l4 4 7-8`} stroke={INK} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />}<rect x="348" y={245 + i * 30} width={96 - i * 18} height="9" rx="4.5" fill={i < 2 ? "#6E7482" : "#fff"} /></g>)}
      <g transform="translate(86 250)"><circle r="46" fill={LIME} /><circle r="30" fill="none" stroke={INK} strokeWidth="9" opacity=".12" /><path d="M0-30A30 30 0 1 1-26 15" fill="none" stroke={INK} strokeWidth="9" strokeLinecap="round" /><text y="6" textAnchor="middle" fontSize="17" fontWeight="800" fill={INK} fontFamily="system-ui">87%</text></g>
      <rect x="388" y="46" width="104" height="36" rx="18" fill={BLUE} /><circle cx="408" cy="64" r="8" fill="#fff" /><rect x="424" y="58" width="52" height="12" rx="6" fill="#fff" opacity=".85" />
      <Spark x={40} y={90} s={1.1} /><Spark x={486} y={170} s={.8} c="#fff" /><Spark x={250} y={30} s={.7} c={LIME} />
    </svg>
  );
}

/** Small card art: a checklist sheet with a lime badge. */
export function PromoScene() {
  return (
    <svg className="illo" viewBox="0 0 200 170" aria-hidden="true">
      <rect x="40" y="26" width="112" height="132" rx="18" fill={INK} transform="rotate(-8 96 92)" />
      <rect x="52" y="20" width="112" height="132" rx="18" fill="#fff" stroke="#E3E6EE" />
      <rect x="68" y="40" width="52" height="9" rx="4.5" fill={INK} />
      {[0, 1, 2].map(i => <g key={i}><rect x="68" y={64 + i * 26} width="18" height="18" rx="6" fill={i < 2 ? BLUE : CANVAS} />{i < 2 && <path d={`M72 ${73 + i * 26}l4 4 7-8`} stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />}<rect x="94" y={69 + i * 26} width={58 - i * 10} height="8" rx="4" fill="#C9CFDB" /></g>)}
      <circle cx="158" cy="42" r="22" fill={LIME} /><path d="M148 42l7 7 12-14" stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Spark x={20} y={46} s={.7} c={BLUE} /><Spark x={186} y={118} s={.6} c={INK} />
    </svg>
  );
}

const base = (children: React.ReactNode, label: string) => (
  <svg className="illo" viewBox="0 0 220 160" role="img" aria-label={label}>
    <ellipse cx="110" cy="146" rx="78" ry="8" fill="#E6E9F0" />
    <circle cx="170" cy="40" r="26" fill={SOFT} /><circle cx="42" cy="110" r="14" fill="#EAF8A8" />
    {children}
    <Spark x={30} y={40} s={.7} c={BLUE} /><Spark x={196} y={96} s={.55} c={INK} />
  </svg>
);

export type ArtName = "tasks" | "calendar" | "people" | "search" | "activity";
export function Art({ name }: { name: ArtName }) {
  switch (name) {
    case "calendar": return base(<>
      <rect x="54" y="30" width="112" height="100" rx="18" fill="#fff" stroke="#DDE1EA" /><path d="M54 62h112v-14a18 18 0 0 0-18-18H72a18 18 0 0 0-18 18z" fill={INK} />
      <rect x="78" y="22" width="8" height="18" rx="4" fill={LIME} /><rect x="134" y="22" width="8" height="18" rx="4" fill={LIME} />
      {[0, 1, 2, 3, 4, 5, 6, 7].map(i => <rect key={i} x={68 + (i % 4) * 22} y={76 + Math.floor(i / 4) * 24} width="16" height="16" rx="5" fill={i === 5 ? BLUE : i === 2 ? LIME : CANVAS} />)}
    </>, "Kalender kosong");
    case "people": return base(<>
      <circle cx="110" cy="64" r="22" fill={INK} /><path d="M70 130c0-24 18-38 40-38s40 14 40 38z" fill={INK} />
      <circle cx="68" cy="76" r="15" fill={BLUE} /><path d="M40 130c0-18 12-28 28-28s28 10 28 28z" fill={BLUE} />
      <circle cx="154" cy="76" r="15" fill={LIME} /><path d="M126 130c0-18 12-28 28-28s28 10 28 28z" fill={LIME} />
    </>, "Tim kosong");
    case "search": return base(<>
      <circle cx="102" cy="72" r="38" fill="#fff" stroke={INK} strokeWidth="9" /><path d="M130 100l30 30" stroke={INK} strokeWidth="13" strokeLinecap="round" />
      <path d="M86 72h32M102 56v32" stroke={BLUE} strokeWidth="6" strokeLinecap="round" opacity=".35" transform="rotate(45 102 72)" />
    </>, "Tidak ditemukan");
    case "activity": return base(<>
      {[0, 1, 2].map(i => <g key={i}><circle cx="68" cy={50 + i * 36} r="11" fill={i === 0 ? LIME : i === 1 ? BLUE : INK} /><rect x="90" y={40 + i * 36} width={86 - i * 14} height="12" rx="6" fill="#fff" stroke="#DDE1EA" /><rect x="90" y={58 + i * 36} width={54 - i * 8} height="7" rx="3.5" fill="#C9CFDB" /></g>)}
      <path d="M68 61v14M68 97v14" stroke="#C9CFDB" strokeWidth="2.5" />
    </>, "Belum ada aktivitas");
    default: return base(<>
      <rect x="60" y="26" width="100" height="112" rx="16" fill="#fff" stroke="#DDE1EA" /><rect x="88" y="18" width="44" height="20" rx="10" fill={INK} /><rect x="102" y="24" width="16" height="7" rx="3.5" fill={LIME} />
      {[0, 1, 2].map(i => <g key={i}><rect x="76" y={54 + i * 26} width="18" height="18" rx="6" fill={i === 0 ? BLUE : CANVAS} />{i === 0 && <path d="M80 63l4 4 7-8" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />}<rect x="102" y={59 + i * 26} width={46 - i * 8} height="8" rx="4" fill="#C9CFDB" /></g>)}
      <path d="M170 134c0-16 4-26 12-34 2 14 8 18 8 34z" fill={BLUE} opacity=".85" /><rect x="164" y="126" width="30" height="16" rx="5" fill={INK} />
    </>, "Belum ada tugas");
  }
}
