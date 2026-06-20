import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { KiokuMark } from './brand';
import { scrollToId } from './anim';
import { SIGNUPS_ENABLED } from '../../config';

const ANCHORS: Array<[string, string]> = [
  ['Recursos', 'recursos'],
  ['Como funciona', 'como-funciona'],
  ['Ciência', 'ciencia'],
  ['Planos', 'precos'],
  ['Em breve', 'em-breve'],
];

export function LandingNav() {
  const nav = useNavigate();
  const reduce = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // The bar gets a solid backdrop when scrolled OR when the mobile menu is open
  // (so the dropdown reads over the page content beneath it).
  const solid = scrolled || menuOpen;

  return (
    <header
      className="sticky top-0 z-50 transition-colors"
      style={{
        background: solid ? 'color-mix(in srgb, var(--bg) 88%, transparent)' : 'transparent',
        backdropFilter: solid ? 'blur(10px)' : 'none',
        borderBottom: `1px solid ${scrolled && !menuOpen ? 'var(--line)' : 'transparent'}`,
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
          {/* Menu sanduíche (só no mobile): abre/fecha o painel de seções. */}
          <button
            type="button"
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="md:hidden grid place-items-center rounded-[var(--r-sm)] p-2 text-muted transition-colors hover:bg-[color:var(--surface-2)] hover:text-fg"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {/* Painel mobile: desce/sobe com slide suave (altura 0 <-> auto). Cada item
          rola até a seção e fecha o menu. */}
      <AnimatePresence initial={false}>
        {menuOpen && (
          <motion.div
            key="mobile-menu"
            className="md:hidden overflow-hidden absolute left-0 right-0 top-full"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
            style={{
              borderBottom: '1px solid var(--line)',
              background: 'color-mix(in srgb, var(--bg) 92%, transparent)',
              backdropFilter: 'blur(10px)',
            }}
          >
            <div className="mx-auto max-w-[1180px] px-5 py-1 flex flex-col">
              {ANCHORS.map(([label, id]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    scrollToId(id, reduce);
                  }}
                  className="text-left py-3 text-sm text-muted hover:text-fg transition-colors"
                  style={{ borderTop: '1px solid var(--line)' }}
                >
                  {label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
