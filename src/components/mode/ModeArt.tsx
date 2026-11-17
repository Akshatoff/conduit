/** Stylised, dependency-free visuals for each environment (no stock photos, no external assets). */
export function ModeArt({ mode, className }: { mode: string; className?: string }) {
  const common = { fill: 'none', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (mode === 'hospital') {
    return (
      <svg viewBox="0 0 320 120" className={className} aria-hidden>
        <rect x="18" y="16" width="284" height="88" rx="10" fill="#0d1a2c" stroke="#2b4467" />
        <rect x="32" y="30" width="116" height="58" rx="6" fill="#081322" stroke="#233450" />
        <polyline points="38,62 54,62 60,48 66,76 72,62 92,62 98,55 104,62 142,62" {...common} stroke="#42d6c5" />
        <rect x="160" y="30" width="60" height="8" rx="4" fill="#4da3ff" opacity="0.8" />
        <rect x="160" y="46" width="94" height="6" rx="3" fill="#2b4467" />
        <rect x="160" y="58" width="76" height="6" rx="3" fill="#2b4467" />
        <rect x="160" y="76" width="42" height="12" rx="6" fill="#42d6c5" opacity="0.25" stroke="#42d6c5" />
        <circle cx="250" cy="66" r="17" fill="#10233c" stroke="#4da3ff" />
        <path d="M250 56v20M240 66h20" stroke="#4da3ff" strokeWidth="3" strokeLinecap="round" />
      </svg>
    )
  }
  if (mode === 'semiconductor') {
    return (
      <svg viewBox="0 0 320 120" className={className} aria-hidden>
        <rect x="18" y="16" width="284" height="88" rx="10" fill="#0b1d22" stroke="#27514f" />
        <circle cx="96" cy="60" r="38" fill="#0d2a2c" stroke="#42d6c5" />
        <clipPath id="waferClip"><circle cx="96" cy="60" r="34" /></clipPath>
        <g clipPath="url(#waferClip)" stroke="#2f7a76" strokeWidth="1">
          {Array.from({ length: 7 }).map((_, i) => (
            <line key={i} x1={62 + i * 11} y1="22" x2={62 + i * 11} y2="98" />
          ))}
          {Array.from({ length: 7 }).map((_, i) => (
            <line key={`h${i}`} x1="58" y1={26 + i * 11} x2="134" y2={26 + i * 11} />
          ))}
        </g>
        <rect x="72" y="44" width="16" height="12" fill="#42d6c5" opacity="0.45" />
        <rect x="100" y="66" width="16" height="12" fill="#f5b942" opacity="0.65" />
        <rect x="160" y="30" width="118" height="7" rx="3.5" fill="#2f7a76" />
        <rect x="160" y="44" width="88" height="7" rx="3.5" fill="#27514f" />
        <rect x="160" y="58" width="104" height="7" rx="3.5" fill="#27514f" />
        <rect x="160" y="76" width="54" height="14" rx="7" fill="#42d6c5" opacity="0.2" stroke="#42d6c5" />
        <circle cx="230" cy="83" r="5" fill="#42d6c5" />
        <path d="M248 83h22" stroke="#2f7a76" strokeWidth="4" strokeLinecap="round" />
      </svg>
    )
  }
  if (mode === 'industrial') {
    return (
      <svg viewBox="0 0 320 120" className={className} aria-hidden>
        <rect x="18" y="16" width="284" height="88" rx="10" fill="#1a1409" stroke="#584221" />
        <circle cx="92" cy="60" r="26" fill="#141008" stroke="#f5b942" />
        <circle cx="92" cy="60" r="9" fill="#241c0d" stroke="#f5b942" />
        {[0, 45, 90, 135].map((a) => (
          <line key={a} transform={`rotate(${a} 92 60)`} x1="92" y1="38" x2="92" y2="48" stroke="#f5b942" strokeWidth="3" strokeLinecap="round" />
        ))}
        <rect x="142" y="30" width="136" height="8" rx="4" fill="#584221" />
        <rect x="142" y="46" width="96" height="8" rx="4" fill="#584221" />
        <rect x="142" y="62" width="118" height="8" rx="4" fill="#584221" />
        <rect x="142" y="80" width="46" height="13" rx="6.5" fill="#f5b942" opacity="0.25" stroke="#f5b942" />
        <path d="M198 86h20l8-12h16" {...common} stroke="#f5b942" opacity="0.8" />
      </svg>
    )
  }
  if (mode === 'food_processing') {
    return (
      <svg viewBox="0 0 320 120" className={className} aria-hidden>
        <rect x="18" y="16" width="284" height="88" rx="10" fill="#20130f" stroke="#5c342a" />
        <circle cx="88" cy="60" r="31" fill="#14100d" stroke="#ef8f6b" />
        <circle cx="88" cy="60" r="21" fill="#241711" stroke="#8a4f3d" />
        <circle cx="82" cy="56" r="5" fill="#ef8f6b" opacity="0.7" />
        <circle cx="94" cy="64" r="4" fill="#f5b942" opacity="0.7" />
        <circle cx="88" cy="50" r="3" fill="#42d6c5" opacity="0.6" />
        <rect x="138" y="30" width="140" height="7" rx="3.5" fill="#5c342a" />
        <rect x="138" y="44" width="98" height="7" rx="3.5" fill="#5c342a" />
        <rect x="138" y="58" width="120" height="7" rx="3.5" fill="#5c342a" />
        <rect x="138" y="78" width="60" height="14" rx="7" fill="#ef8f6b" opacity="0.2" stroke="#ef8f6b" />
        <circle cx="218" cy="85" r="5" fill="#ef8f6b" />
        <path d="M236 85h26" stroke="#5c342a" strokeWidth="4" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 320 120" className={className} aria-hidden>
      <rect x="18" y="16" width="284" height="88" rx="10" fill="#161226" stroke="#3f3468" />
      <g transform="translate(88 60)">
        {[42, 30, 18].map((r) => (
          <circle key={r} r={r} fill="none" stroke="#b18cff" strokeOpacity={r === 18 ? 0.9 : 0.3} strokeWidth="2" />
        ))}
        <circle r="7" fill="#b18cff" />
        <path d="M0 -48v10M0 38v10M-48 0h10M38 0h10" stroke="#b18cff" strokeWidth="2" strokeLinecap="round" />
      </g>
      <rect x="158" y="30" width="116" height="18" rx="9" fill="#b18cff" opacity="0.18" stroke="#b18cff" />
      <rect x="158" y="58" width="86" height="10" rx="5" fill="#3f3468" />
      <rect x="158" y="76" width="104" height="10" rx="5" fill="#3f3468" />
    </svg>
  )
}
