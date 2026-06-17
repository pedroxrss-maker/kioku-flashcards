import { useNavigate } from 'react-router-dom';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { KiokuMark, NeuroWordmark } from './brand';
import { scrollToId } from './anim';

const LINKS: Array<[string, string]> = [
  ['Recursos', 'recursos'],
  ['Como funciona', 'como-funciona'],
  ['Ciência', 'ciencia'],
  ['Em breve', 'em-breve'],
];

export function LandingFooter() {
  const nav = useNavigate();
  const reduce = useReducedMotion();

  return (
    <footer style={{ borderTop: '1px solid var(--line)' }}>
      <div className="mx-auto max-w-[1180px] px-5 md:px-8 py-12">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8">
          <div className="max-w-xs">
            <KiokuMark size={26} />
            <p className="text-sm text-muted mt-3" style={{ lineHeight: 1.6 }}>
              Recordação ativa e repetição espaçada para vencer a curva do esquecimento.
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            {LINKS.map(([label, id]) => (
              <button
                key={id}
                type="button"
                onClick={() => scrollToId(id, reduce)}
                className="text-sm text-muted hover:text-fg transition-colors"
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => nav('/entrar')}
              className="text-sm text-muted hover:text-fg transition-colors"
            >
              Entrar
            </button>
          </nav>
        </div>

        <div
          className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-10 pt-6"
          style={{ borderTop: '1px solid var(--line)' }}
        >
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            powered by <NeuroWordmark size={12} />
          </span>
          <div className="flex items-center gap-4 text-xs text-muted">
            <button
              type="button"
              onClick={() => nav('/privacidade')}
              className="hover:text-fg transition-colors"
            >
              Política de Privacidade
            </button>
            <span>© Kioku</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
