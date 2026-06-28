import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Sparkles, Timer } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Panel } from '../components/Panel';
import type { QueryResult } from '../db/store';
import { useDisciplinas, useTopicos, useVestibulares } from '../features/provas/queries';
import { generateBancoFlashcards } from '../features/provas/generate';
import type { BancoProgress } from '../features/provas/generate';
import { createDeckFromGenerated } from '../features/ai/cards';
import type { GeneratedCard } from '../features/ai/cards';
import { QuotaError } from '../features/ai/client';
import { recordFeatureUse } from '../features/gamification/achievements';
import { useUpgradeModal } from '../features/billing/UpgradeModalProvider';
import { pushToast } from '../lib/toast';

/**
 * Banco de provas — primeira tela. Navegacao progressiva em 3 passos:
 *   1) vestibular (pills)  ->  2) disciplina (grade de cards)  ->  3) topico (lista)
 * Por enquanto, tocar num topico so loga a selecao; a geracao (flashcards/simulado)
 * vem depois. Dados via funcoes qb_* (src/features/provas/queries.ts).
 */

/** Renderiza o estado de uma query (carregando / erro+retry / vazio) ou o corpo. */
function asyncBody<T>(q: QueryResult<T[]>, emptyMsg: string, body: (rows: T[]) => ReactNode): ReactNode {
  if (q.loading && !q.loaded) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted py-4">
        <Loader2 size={16} className="animate-spin" /> Carregando…
      </div>
    );
  }
  if (q.error) {
    return (
      <div className="flex items-center gap-3 py-4 text-sm">
        <span className="text-muted">Não foi possível carregar.</span>
        <button type="button" className="btn btn-sm" onClick={q.reload}>
          Tentar novamente
        </button>
      </div>
    );
  }
  if (q.data.length === 0) {
    return <p className="text-sm text-muted py-4">{emptyMsg}</p>;
  }
  return body(q.data);
}

/** Escapa texto p/ interpolação segura em HTML confiável (o rodapé de fonte). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Cabecalho numerado de cada passo. */
function StepTitle({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span
        className="shrink-0 grid place-items-center rounded-full text-xs font-semibold"
        style={{ width: 22, height: 22, background: 'var(--accent-soft)', color: 'var(--accent)' }}
      >
        {n}
      </span>
      <h2 className="font-semibold leading-tight">{children}</h2>
    </div>
  );
}

/** Estimativa inicial (ms) antes de qualquer evento de lote. Ajustada adiante. */
const DEFAULT_EST_MS = 30000;
/** Teto do preenchimento por tempo: nunca chega a 100% sozinho — só o evento
 *  `done` real leva a barra até 100%. */
const FILL_CAP = 95;

/**
 * Termômetro da geração (passo 4): enche de 0→FILL_CAP suavemente com base no
 * TEMPO decorrido contra uma estimativa, e só vai a 100% quando a geração termina
 * de verdade (`done`). Mesma linguagem visual da barra de criação de deck
 * (GenerateDeck): caixa em --surface-2, trilho em --surface, fill em --accent.
 *
 * - Sobe sempre (monotônico) e nunca recua, mesmo se a estimativa for revisada.
 * - Estimativa ADAPTATIVA: cada evento de progresso refina est = (tempo/lote) ×
 *   totalLotes; entre eventos, o rAF continua subindo suavemente.
 * - Trava em FILL_CAP (95%) se demorar mais que o estimado (nunca mostra 100% e
 *   segue "girando").
 * - No `done`, faz um ease suave do valor atual até 100%.
 * A largura é escrita direto no DOM via rAF (sem re-render por frame).
 */
function GenProgress({ gen }: { gen: { progress?: BancoProgress; done?: boolean } }) {
  const p = gen.progress;
  const cards = p?.cardsSoFar ?? 0;
  const label = gen.done
    ? 'Pronto! Abrindo seu deck…'
    : p
      ? `Gerando flashcards… ${cards} ${cards === 1 ? 'card' : 'cards'}`
      : 'Iniciando geração…';

  const fillRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<number>(performance.now());
  const estRef = useRef<number>(DEFAULT_EST_MS);
  const pctRef = useRef<number>(0);
  const doneRef = useRef<boolean>(false);

  // Refina a estimativa a cada evento de lote: tempo-por-lote × totalLotes. Nunca
  // deixa a estimativa cair abaixo do já decorrido (evitaria saltos/travas).
  useEffect(() => {
    if (gen.done || !p || p.batch < 1 || p.totalBatches < 1) return;
    const elapsed = performance.now() - startRef.current;
    const est = (elapsed / p.batch) * p.totalBatches;
    estRef.current = Math.max(est, elapsed + 1000);
  }, [p?.batch, p?.totalBatches, gen.done]);

  // Espelha `done` num ref p/ o loop rAF (que tem deps vazias) sempre ver o atual.
  useEffect(() => {
    doneRef.current = !!gen.done;
  }, [gen.done]);

  // Loop de animação: largura por tempo decorrido (teto FILL_CAP), monotônica; no
  // done, ease suave até 100% e então para.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = fillRef.current;
      if (el) {
        let next: number;
        if (doneRef.current) {
          // Ease exponencial até 100% (sobe ~20% do que falta por frame).
          next = pctRef.current + (100 - pctRef.current) * 0.2;
          if (next >= 99.8) next = 100;
        } else {
          const elapsed = performance.now() - startRef.current;
          const raw = (elapsed / estRef.current) * 100;
          next = Math.min(FILL_CAP, Math.max(pctRef.current, raw)); // só sobe, teto 95%
        }
        pctRef.current = next;
        el.style.width = `${next}%`;
      }
      if (doneRef.current && pctRef.current >= 100) return; // parou cheio
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className="p-4 rounded-[var(--r-md)]"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}
    >
      <div className="flex items-center gap-2 mb-2.5">
        <Loader2 size={15} className="animate-spin" style={{ color: 'var(--accent)' }} />
        <span className="text-sm font-semibold">{label}</span>
      </div>

      <div style={{ height: 8, borderRadius: 999, background: 'var(--surface)', overflow: 'hidden' }}>
        <div
          ref={fillRef}
          style={{ width: '0%', height: '100%', borderRadius: 999, background: 'var(--accent)' }}
        />
      </div>

      {/* Contagem de lotes só quando ela informa algo (≥2 lotes, ainda gerando). */}
      {!gen.done && p && p.totalBatches >= 2 && (
        <p className="text-xs text-muted mt-2.5">
          Lote {p.batch} de {p.totalBatches}
        </p>
      )}
    </div>
  );
}

export function BancoProvas() {
  const [vestibular, setVestibular] = useState<string | null>(null);
  const [disciplina, setDisciplina] = useState<string | null>(null);
  // Tópico escolhido (com sua contagem) -> abre a tela de escolha (passo 4).
  const [sel, setSel] = useState<{ topico: string; total: number } | null>(null);
  // Estado da geração de flashcards por IA. `done` = geração concluída: a barra
  // enche até 100% por um instante antes de navegar para o deck.
  const [gen, setGen] = useState<{
    running: boolean;
    progress?: BancoProgress;
    done?: boolean;
    error?: string;
  }>({ running: false });

  const nav = useNavigate();
  const { openUpgrade } = useUpgradeModal();

  const vestibulares = useVestibulares();
  const disciplinas = useDisciplinas(vestibular);
  const topicos = useTopicos(vestibular, disciplina);

  // Trocar de vestibular zera disciplina + tópico (e, por consequência, os passos
  // seguintes).
  const pickVestibular = (v: string) => {
    setVestibular((cur) => (cur === v ? cur : v));
    setDisciplina(null);
    setSel(null);
    setGen({ running: false });
  };

  const pickDisciplina = (d: string) => {
    setDisciplina(d);
    setSel(null);
    setGen({ running: false });
  };

  const pickTopico = (topico: string, total: number) => {
    setSel({ topico, total });
    setGen({ running: false });
  };

  // "Gerar flashcards": chama o endpoint SSE, mostra o progresso, cria o deck e
  // navega para ele — reaproveitando o mesmo fluxo da geração normal de deck.
  async function gerarFlashcards() {
    if (!vestibular || !disciplina || !sel) return;
    setGen({ running: true });
    try {
      const cards = await generateBancoFlashcards(
        { vestibular, disciplina, topico: sel.topico },
        { onProgress: (p) => setGen({ running: true, progress: p }) },
      );
      const name = `${disciplina} · ${sel.topico} (${vestibular.toUpperCase()})`;
      const generated: GeneratedCard[] = cards.map((c) => ({ type: 'basic', front: c.front, back: c.back }));
      // Rodapé discreto de fonte, só em cards do banco de provas: pequeno, centrado
      // e em cor suave. Usa apenas estilos inline permitidos pelo sanitizeHtml
      // (text-align/font-size/margin/color). O vestibular é escapado por segurança.
      const fonte = escapeHtml(vestibular.toUpperCase());
      const backHtmlSuffix =
        `<div style="text-align: center; font-size: 0.33em; margin-top: 1.25em; color: var(--muted)">` +
        `Adaptado de provas do ${fonte}</div>`;
      // Geração concluída: enche a barra até 100% (com a contagem real de cards)
      // por um instante antes de navegar, p/ o usuário ver a conclusão.
      setGen({ running: true, done: true, progress: { batch: 1, totalBatches: 1, cardsSoFar: cards.length } });
      const { deck } = await createDeckFromGenerated(name, generated, {
        category: 'IA',
        language: 'Portuguese (Brazil)',
        backHtmlSuffix,
      });
      void recordFeatureUse('aigen');
      await new Promise((r) => setTimeout(r, 550)); // deixa a barra cheia visível
      nav(`/decks/${deck.id}`);
    } catch (e) {
      // Free user no limite → upsell em vez de erro morto (mesma UX do deck normal).
      if (e instanceof QuotaError && openUpgrade(e.info.metric)) {
        setGen({ running: false });
        return;
      }
      const msg = e instanceof Error ? e.message : 'Falha ao gerar os flashcards.';
      setGen({ running: false, error: msg });
      pushToast('error', msg);
    }
  }

  return (
    <>
      <PageHeader
        title="Banco de provas"
        subtitle="Questões de vestibulares por disciplina e tópico."
      />

      <div className="flex flex-col gap-6">
        {/* Passo 1: vestibular */}
        <section>
          <StepTitle n={1}>Escolha o vestibular</StepTitle>
          {asyncBody(vestibulares, 'Nenhum vestibular disponível ainda.', (rows) => (
            <div className="flex flex-wrap gap-2">
              {rows.map((v) => {
                const on = vestibular === v.vestibular;
                return (
                  <button
                    key={v.vestibular}
                    type="button"
                    onClick={() => pickVestibular(v.vestibular)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--r-md)] text-sm font-semibold ai-hover-outline"
                    style={{
                      background: on ? 'var(--accent-soft)' : 'var(--surface)',
                      border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
                      color: on ? 'var(--accent)' : 'var(--fg)',
                    }}
                  >
                    {v.vestibular.toUpperCase()}
                    <span className="text-xs font-normal text-muted">{Number(v.total)}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </section>

        {/* Passo 2: disciplina (so apos escolher o vestibular) */}
        {vestibular && (
          <section>
            <StepTitle n={2}>Escolha a disciplina</StepTitle>
            {asyncBody(disciplinas, 'Nenhuma disciplina para este vestibular.', (rows) => (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {rows.map((d) => {
                  const on = disciplina === d.disciplina;
                  return (
                    <Panel
                      key={d.disciplina}
                      hoverable
                      onClick={() => pickDisciplina(d.disciplina)}
                      className="p-4"
                      style={{
                        border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
                        background: on ? 'var(--accent-soft)' : undefined,
                      }}
                    >
                      <div className="font-semibold leading-tight" style={{ color: on ? 'var(--accent)' : 'var(--fg)' }}>
                        {d.disciplina}
                      </div>
                      <div className="text-xs text-muted mt-1">{Number(d.total)} questões</div>
                    </Panel>
                  );
                })}
              </div>
            ))}
          </section>
        )}

        {/* Passo 3: topico (so apos escolher a disciplina) */}
        {vestibular && disciplina && (
          <section>
            <StepTitle n={3}>Escolha o tópico</StepTitle>
            {asyncBody(topicos, 'Nenhum tópico para esta disciplina.', (rows) => (
              <Panel className="overflow-hidden">
                {rows.map((t, i) => {
                  const on = sel?.topico === t.topico;
                  return (
                    <button
                      key={t.topico}
                      type="button"
                      onClick={() => pickTopico(t.topico, Number(t.total))}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left ai-hover-outline"
                      style={{
                        borderTop: i === 0 ? undefined : '1px solid var(--line)',
                        background: on ? 'var(--accent-soft)' : undefined,
                        color: on ? 'var(--accent)' : undefined,
                      }}
                    >
                      <span className="font-medium">{t.topico}</span>
                      <span className="text-xs text-muted shrink-0">{Number(t.total)} questões</span>
                    </button>
                  );
                })}
              </Panel>
            ))}
          </section>
        )}

        {/* Passo 4: o que fazer com o tópico (so apos escolher o topico) */}
        {vestibular && disciplina && sel && (
          <section>
            <StepTitle n={4}>O que você quer fazer?</StepTitle>
            <Panel className="p-5">
              <p className="text-sm text-muted mb-4">
                {vestibular.toUpperCase()} · {disciplina} ·{' '}
                <span className="text-fg font-medium">{sel.topico}</span> · {sel.total} questões
              </p>

              {gen.running ? (
                <GenProgress gen={gen} />
              ) : (
                <div className="flex flex-col sm:flex-row gap-3">
                  <button type="button" onClick={gerarFlashcards} className="btn btn-accent">
                    <Sparkles size={16} /> Gerar flashcards
                  </button>
                  <button
                    type="button"
                    disabled
                    className="btn"
                    style={{ opacity: 0.55, cursor: 'not-allowed' }}
                    title="Em breve"
                  >
                    <Timer size={16} /> Fazer simulado · Em breve
                  </button>
                </div>
              )}

              {gen.error && !gen.running && (
                <p className="text-sm mt-3" style={{ color: 'var(--accent)' }}>
                  {gen.error}
                </p>
              )}
            </Panel>
          </section>
        )}
      </div>
    </>
  );
}
