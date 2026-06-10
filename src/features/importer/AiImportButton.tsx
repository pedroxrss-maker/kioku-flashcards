import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Globe, Loader2, Sparkles } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { GeneratedCardsEditor } from '../ai/GeneratedCardsEditor';
import { generateCardsBatched, isAiConfigured } from '../ai/anthropic';
import { createDeckFromGenerated } from '../ai/cards';
import { extractFromUrl } from '../ai/url';
import { fileToBase64 } from '../ai/readFile';
import type { GeneratedCard, GenerateSource } from '../ai/cards';

const LANGS: Array<[string, string]> = [
  ['Portuguese (Brazil)', 'Português'],
  ['English', 'Inglês'],
  ['Spanish', 'Espanhol'],
  ['French', 'Francês'],
  ['German', 'Alemão'],
  ['Italian', 'Italiano'],
  ['Japanese', 'Japonês'],
];
const TARGETS = [20, 30, 50, 80, 100];
const MAX_PDF_BYTES = 25 * 1024 * 1024;

/** Entry point button (placed next to the .apkg import) that opens the AI import
 *  modal. The .apkg importer stays a separate, untouched component. */
export function AiImportButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" icon={<Sparkles size={16} />} onClick={() => setOpen(true)}>
        Importar com IA
      </Button>
      <AiImportModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function AiImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const configured = isAiConfigured();

  const [tab, setTab] = useState<'pdf' | 'url'>('pdf');
  const [pdf, setPdf] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [language, setLanguage] = useState('Portuguese (Brazil)');
  const [target, setTarget] = useState(30);
  const [deckName, setDeckName] = useState('');
  const [cards, setCards] = useState<GeneratedCard[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPdf(null);
    setUrl('');
    setCards(null);
    setBusy(false);
    setProgress(null);
    setError(null);
    setDeckName('');
  }
  function close() {
    reset();
    onClose();
  }

  async function generate() {
    setError(null);
    setBusy(true);
    setProgress(tab === 'pdf' ? 'Lendo o PDF...' : 'Obtendo o conteúdo da URL...');
    try {
      let source: GenerateSource;
      let defaultName: string;
      if (tab === 'pdf') {
        if (!pdf) throw new Error('Selecione um arquivo PDF.');
        if (pdf.size > MAX_PDF_BYTES) {
          throw new Error('PDF muito grande (máximo 25 MB). Tente um arquivo menor.');
        }
        source = { kind: 'pdf', base64: await fileToBase64(pdf) };
        defaultName = pdf.name.replace(/\.pdf$/i, '') || 'Deck do PDF';
      } else {
        if (!url.trim()) throw new Error('Informe uma URL.');
        const extracted = await extractFromUrl(url);
        source = { kind: 'text', text: extracted.text };
        defaultName = extracted.title;
      }
      setProgress('Gerando cards...');
      const result = await generateCardsBatched(
        { kind: 'qa', language, source },
        target,
        (p) => setProgress(`Gerando cards... (etapa ${p.call}, ${p.got}/${p.target})`),
      );
      setCards(result);
      if (!deckName.trim()) setDeckName(defaultName || 'Deck gerado por IA');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao gerar os cards.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function confirm() {
    if (!cards) return;
    setBusy(true);
    setError(null);
    try {
      const deck = await createDeckFromGenerated(deckName, cards, { language, category: 'IA' });
      close();
      nav(`/decks/${deck.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao criar o deck.');
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Importar com IA"
      width={640}
      footer={
        <Button variant="ghost" onClick={close}>
          Fechar
        </Button>
      }
    >
      {!configured ? (
        <p className="text-sm text-muted" style={{ lineHeight: 1.6 }}>
          IA não configurada. Defina <b className="text-fg">VITE_AI_PROXY_URL</b> (recomendado: um
          Cloudflare Worker que guarda a chave) ou, apenas para teste local,{' '}
          <b className="text-fg">VITE_ANTHROPIC_API_KEY</b>, e refaça o build.
        </p>
      ) : cards ? (
        <div className="flex flex-col gap-4">
          <div>
            <label className="field-label" htmlFor="ai-imp-name">
              Nome do deck
            </label>
            <input
              id="ai-imp-name"
              className="field"
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
            />
          </div>
          <GeneratedCardsEditor
            cards={cards}
            onChange={setCards}
            onConfirm={confirm}
            busy={busy}
            confirmLabel="Criar deck"
          />
          {error && (
            <span className="mono text-[12px]" style={{ color: 'var(--accent)' }}>
              {error}
            </span>
          )}
          <button
            type="button"
            onClick={() => setCards(null)}
            className="text-sm text-muted hover:text-fg transition-colors self-start"
          >
            Voltar e gerar de novo
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div
            className="grid grid-cols-2 gap-1 p-1"
            style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-sm)' }}
            role="tablist"
          >
            {(
              [
                ['pdf', 'PDF', FileText],
                ['url', 'URL (YouTube / web)', Globe],
              ] as const
            ).map(([id, label, Icon]) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(id)}
                  className="py-1.5 px-2 rounded-[var(--r-sm)] text-center transition-colors inline-flex items-center justify-center gap-1.5"
                  style={{ background: active ? 'var(--accent)' : 'transparent', color: active ? '#fff' : 'var(--muted)' }}
                >
                  <Icon size={14} />
                  <span className="text-sm font-semibold">{label}</span>
                </button>
              );
            })}
          </div>

          {tab === 'pdf' ? (
            <>
              <p className="text-sm text-muted" style={{ lineHeight: 1.55 }}>
                Envie um PDF e a IA cria flashcards de pergunta e resposta a partir do conteúdo.
              </p>
              <div>
                <span className="field-label">Arquivo PDF</span>
                <label
                  className="flex items-center gap-3 cursor-pointer surface p-3"
                  style={{ borderStyle: 'dashed' }}
                >
                  <FileText size={18} className="text-muted shrink-0" />
                  <span className="text-sm flex-1 min-w-0 truncate">
                    {pdf ? pdf.name : 'Escolher um PDF (até 25 MB)'}
                  </span>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    hidden
                    onChange={(e) => {
                      setPdf(e.target.files?.[0] ?? null);
                      e.target.value = '';
                    }}
                  />
                  <span className="btn btn-ghost btn-sm shrink-0">Procurar</span>
                </label>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted" style={{ lineHeight: 1.55 }}>
                Cole o link de um vídeo do YouTube (usa a transcrição) ou de uma página. Muitos sites
                bloqueiam o acesso direto (CORS); se falhar, copie o texto e use "Gerar deck com IA"
                no modo Anotações.
              </p>
              <div>
                <label className="field-label" htmlFor="ai-imp-url">
                  URL
                </label>
                <input
                  id="ai-imp-url"
                  className="field"
                  value={url}
                  placeholder="https://www.youtube.com/watch?v=..."
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="ai-imp-lang">
                Idioma dos cards
              </label>
              <select
                id="ai-imp-lang"
                className="field"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {LANGS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="ai-imp-count">
                Quantidade alvo
              </label>
              <select
                id="ai-imp-count"
                className="field"
                value={target}
                onChange={(e) => setTarget(Number(e.target.value))}
              >
                {TARGETS.map((t) => (
                  <option key={t} value={t}>
                    {t} cards
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="accent"
              icon={busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              onClick={generate}
              disabled={busy}
            >
              {busy ? 'Gerando...' : 'Gerar cards'}
            </Button>
            {(progress || error) && (
              <span
                className="mono text-[12px]"
                style={{ color: error ? 'var(--accent)' : 'var(--muted)' }}
              >
                {error ?? progress}
              </span>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
