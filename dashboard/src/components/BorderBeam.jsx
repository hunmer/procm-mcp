import { useEffect } from 'react';

const STYLE_ID = 'border-beam-styles';

const BORDER_BEAM_CSS = `
@keyframes border-beam-spin {
  from { --angle: 0deg; }
  to { --angle: 360deg; }
}

@property --angle {
  syntax: "<angle>";
  initial-value: 0deg;
  inherits: false;
}
`;

export default function BorderBeam({
  className = '',
  size = 200,
  duration = 12,
  delay = 0,
  colorFrom = '#ffaa40',
  colorTo = '#9c40ff',
  borderWidth = 1.5,
  squircle = false,
}) {
  useEffect(() => {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = BORDER_BEAM_CSS;
    document.head.appendChild(style);
  }, []);

  const cornerShape = squircle ? { cornerShape: 'squircle' } : {};

  return (
    <div
      className={`pointer-events-none absolute inset-0 ${className}`}
      style={{
        '--size': size,
        '--duration': `${duration}s`,
        '--delay': `-${delay}s`,
        '--color-from': colorFrom,
        '--color-to': colorTo,
        '--border-width': `${borderWidth}px`,
        ...cornerShape,
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          borderRadius: 'inherit',
          padding: 'var(--border-width)',
          background: `
            linear-gradient(
              var(--angle, 0deg),
              transparent 0%,
              transparent 35%,
              var(--color-from) 50%,
              var(--color-to) 65%,
              transparent 80%,
              transparent 100%
            )
          `,
          mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          maskComposite: 'exclude',
          WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          animation: 'border-beam-spin var(--duration) linear infinite var(--delay)',
          ...cornerShape,
        }}
      />
    </div>
  );
}
