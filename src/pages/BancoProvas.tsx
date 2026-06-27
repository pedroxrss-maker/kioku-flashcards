import { useState } from 'react';
import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Panel } from '../components/Panel';
import type { QueryResult } from '../db/store';
import { useDisciplinas, useTopicos, useVestibulares } from '../features/provas/queries';

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

export function BancoProvas() {
  const [vestibular, setVestibular] = useState<string | null>(null);
  const [disciplina, setDisciplina] = useState<string | null>(null);

  const vestibulares = useVestibulares();
  const disciplinas = useDisciplinas(vestibular);
  const topicos = useTopicos(vestibular, disciplina);

  // Trocar de vestibular zera a disciplina (e, por consequencia, os topicos).
  const pickVestibular = (v: string) => {
    setVestibular((cur) => (cur === v ? cur : v));
    setDisciplina(null);
  };

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
                      onClick={() => setDisciplina(d.disciplina)}
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
                {rows.map((t, i) => (
                  <button
                    key={t.topico}
                    type="button"
                    onClick={() =>
                      // eslint-disable-next-line no-console
                      console.log('[banco-provas] selecao', { vestibular, disciplina, topico: t.topico })
                    }
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left ai-hover-outline"
                    style={{ borderTop: i === 0 ? undefined : '1px solid var(--line)' }}
                  >
                    <span className="font-medium">{t.topico}</span>
                    <span className="text-xs text-muted shrink-0">{Number(t.total)} questões</span>
                  </button>
                ))}
              </Panel>
            ))}
          </section>
        )}
      </div>
    </>
  );
}
