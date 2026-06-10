import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { KiokuMark } from './brand';
import { scrollToId } from './anim';
import { SIGNUPS_ENABLED } from '../../config';

const ANCHORS: Array<[string, string]> = [
  ['Recursos', 'recursos'],
  ['Como funciona', 'como-funciona'],
  ['Ciência', 'ciencia'],
  ['Em breve', 'em-breve'],
];

export function LandingNav() {
  const nav = useNavigate();
  const reduce = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className="sticky top-0 z-50 transition-colors"
      style={{
        background: scrolled ? 'color-mix(in srgb, var(--bg) 82%, transparent)' : 'transparent',
        backdropFilter: scrolled ? 'blur(10px)' : 'none',
        borderBottom: `1px solid ${scrolled ? 'var(--line)' : 'transparent'}`,
      }}
    >
      <nav className="mx-auto max-w-[1180px] px-5 md:px-8 h-16 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => scrollToId('topo', reduce)}
          aria-label="Kioku"
          className="shrink-0"
        >
          <KiokuMark size={26} />
        </button>

        <div className="hidden md:flex items-center gap-1">
          {ANCHORS.map(([label, id]) => (
            <button
              key={id}
              type="button"
              onClick={() => scrollToId(id, reduce)}
              className="nav-link px-3 py-2 text-sm text-muted hover:text-fg transition-colors"
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => nav('/entrar')}
            className="btn btn-ghost btn-sm"
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => nav(SIGNUPS_ENABLED ? '/entrar?mode=signup' : '/entrar')}
            className="btn btn-accent btn-sm"
          >
            Criar conta
          </button>
        </div>
      </nav>
    </header>
  );
}
