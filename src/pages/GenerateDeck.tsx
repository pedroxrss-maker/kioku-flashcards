import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ClipboardList, FileText, Loader2, Sparkles, Type, Wand2 } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Panel } from '../components/Panel';
import { Button } from '../components/Button';
import { NumberRoller } from '../components/NumberRoller';
import { GeneratedCardsEditor } from '../features/ai/GeneratedCardsEditor';
import { generateCards, isAiConfigured } from '../features/ai/client';
import { createDeckFromGenerated } from '../features/ai/cards';
import { fileToBase64 } from '../features/ai/readFile';
import type { GeneratedCard, GenerateSource } from '../features/ai/cards';
import type { CardType } from '../lib/cardType';

type Mode = 'topic' | 'notes' | 'pdf';

const MODES: Array<{ id: Mode; label: string; icon: typeof Type }> = [
  { id: 'topic', label: 'Tema', icon: Type },
  { id: 'notes', label: 'Anotações', icon: ClipboardList },
  { id: 'pdf', label: 'PDF', icon: FileText },
];

const CARD_TYPES: Array<{ id: CardType; label: string }> = [
  { id: 'basic', label: 'Básico' },
  { id: 'cloze', label: 'Cloze' },
  { id: 'typein', label: 'Escreva a resposta' },
];

const LANGS: Array<[string, string]> = [
  ['Portuguese (Brazil)', 'Português'],
  ['English', 'Inglês'],
  ['Spanish', 'Espanhol'],
  ['French', 'Francês'],
  ['German', 'Alemão'],
  ['Italian', 'Italiano'],
  ['Japanese', 'Japonês'],
];

const MAX_PDF_BYTES = 15 * 1024 * 1024;

/** Directional slide for the source panel (Tema / Anotações / PDF). */
const SOURCE_SLIDE = {
  enter: (d: number) => ({ opacity: 0, x: d * 18 }),
  center: { opacity: 1, x: 0 },
  exit: (d: number) => ({ opacity: 0, x: d * -18 }),
};

export function GenerateDeck() {
  const nav = useNavigate();
  const configured = isAiConfigured();

  const [mode, setMode] = useState<Mode>('topic');
  const [sourceDir, setSourceDir] = useState(0);
  const [topic, setTopic] = useState('');
  const [notes, setNotes] = useState('');
  const [pdf, setPdf] = useState<File | null>(null);
  const [types, setTypes] = useState<CardType[]>(['basic']);
  const [count, setCount] = useState(20);
  const [language, setLanguage] = useState('Portuguese (Brazil)');
  const [deckName, setDeckName] = useState('');

  const [cards, setCards] = useState<GeneratedCard[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function selectMode(m: Mode) {
    setSourceDir(MODES.findIndex((x) => x.id === m) > MODES.findIndex((x) => x.id === mode) ? 1 : -1);
    setMode(m);
  }

  function toggleType(t: CardType) {
    setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  }

  async function generate() {
    setError(null);
    if (types.length === 0) {
      setError('Selecione ao menos um tipo de card.');
      return;
    }
    let source: GenerateSource;
    if (mode === 'pdf') {
      if (!pdf) {
        setError('Selecione um arquivo PDF.');
        return;
      }
      if (pdf.size > MAX_PDF_BYTES) {
        setError('PDF muito grande (máximo 15 MB). Tente um arquivo menor.');
        return;
      }
      setBusy(true);
      try {
        source = { kind: 'pdf', base64: await fileToBase64(pdf) };
      } catch {
        setBusy(false);
        setError('Não foi possível ler o PDF.');
        return;
      }
    } else {
      const text = (mode === 'topic' ? topic : notes).trim();
      if (!text) {
        setError(mode === 'topic' ? 'Descreva o tema do deck.' : 'Cole o conteúdo para gerar os cards.');
        return;
      }
      source = { kind: 'text', text };
      setBusy(true);
    }

    try {
      const result = await generateCards({ types, count, language, source });
      setCards(result);
      if (!deckName.trim()) {
        const fallback =
          mode === 'pdf'
            ? pdf?.name.replace(/\.pdf$/i, '') ?? 'Deck gerado por IA'
            : mode === 'topic'
              ? topic.trim().slice(0, 60)
              : 'Deck gerado por IA';
        setDeckName(fallback || 'Deck gerado por IA');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao gerar os cards.');
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!cards) return;
    setBusy(true);
    setError(null);
    try {
      const deck = await createDeckFromGenerated(deckName, cards, { language });
      nav(`/decks/${deck.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao criar o deck.');
      setBusy(false);
    }
  }

  return (
    <div className="rise flex flex-col gap-6 max-w-3xl mx-auto">
      <PageHeader
        title="Gerar deck com IA"
        subtitle="Crie cards a partir de um tema, suas anotações ou um PDF."
      />

      {!configured ? (
        <Panel className="p-5">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={16} className="text-accent" />
            <h2 className="mono text-sm text-muted">IA não configurada</h2>
          </div>
          <p className="text-sm text-muted" style={{ lineHeight: 1.6 }}>
            Para usar os recursos de IA, configure no Cloudflare a variável{' '}
            <b className="text-fg">VITE_AI_PROXY_URL</b> (recomendado: um Worker que guarda a chave
            no servidor) ou, apenas para teste local, <b className="text-fg">VITE_GEMINI_API_KEY</b>.
            Depois refaça o build.
          </p>
          <Link to="/decks" className="btn btn-ghost btn-sm mt-4">
            Voltar aos decks
          </Link>
        </Panel>
      ) : (
        <>
          <Panel className="p-5 flex flex-col gap-4">
            {/* Source mode */}
            <div>
              <span className="field-label">Fonte</span>
              <div
                className="grid grid-cols-3 gap-1 p-1"
                style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-sm)' }}
                role="tablist"
              >
                {MODES.map((m) => {
                  const active = mode === m.id;
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => selectMode(m.id)}
                      className="relative py-1.5 px-2 rounded-[var(--r-sm)] text-center transition-colors inline-flex items-center justify-center gap-1.5"
                      style={{ color: active ? '#fff' : 'var(--muted)' }}
                    >
                      {active && (
                        <motion.span
                          layoutId="fonte-pill"
                          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                          style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'var(--accent)',
                            borderRadius: 'var(--r-sm)',
                            zIndex: 0,
                          }}
                        />
                      )}
                      <span className="relative z-[1] inline-flex items-center gap-1.5">
                        <Icon size={14} />
                        <span className="text-sm font-semibold">{m.label}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Source input: slides between Tema / Anotações / PDF. */}
            <AnimatePresence mode="wait" custom={sourceDir} initial={false}>
              <motion.div
                key={mode}
                custom={sourceDir}
                variants={SOURCE_SLIDE}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                {mode === 'topic' && (
                  <div>
                    <label className="field-label" htmlFor="g-topic">
                      Tema ou instrução
                    </label>
                    <textarea
                      id="g-topic"
                      className="field"
                      rows={3}
                      value={topic}
                      placeholder="Ex.: Verbos irregulares em inglês para iniciantes"
                      onChange={(e) => setTopic(e.target.value)}
                    />
                  </div>
                )}
                {mode === 'notes' && (
                  <div>
                    <label className="field-label" htmlFor="g-notes">
                      Cole suas anotações
                    </label>
                    <textarea
                      id="g-notes"
                      className="field"
                      rows={8}
                      value={notes}
                      placeholder="Cole aqui o texto que vira flashcards..."
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                )}
                {mode === 'pdf' && (
                  <div>
                    <span className="field-label">Arquivo PDF</span>
                    <label
                      className="flex items-center gap-3 cursor-pointer surface p-3"
                      style={{ borderStyle: 'dashed' }}
                    >
                      <FileText size={18} className="text-muted shrink-0" />
                      <span className="text-sm flex-1 min-w-0 truncate">
                        {pdf ? pdf.name : 'Escolher um PDF (até 15 MB)'}
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
                )}
              </motion.div>
            </AnimatePresence>

            {/* Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="field-label">Tipo de card</span>
                <div className="flex flex-col gap-1.5">
                  {CARD_TYPES.map((ct) => {
                    const checked = types.includes(ct.id);
                    return (
                      <button
                        key={ct.id}
                        type="button"
                        onClick={() => toggleType(ct.id)}
                        aria-pressed={checked}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-[var(--r-sm)] text-left transition-colors"
                        style={{
                          background: 'var(--surface-2)',
                          border: `1px solid ${checked ? 'var(--accent)' : 'var(--line)'}`,
                        }}
                      >
                        <span
                          className="flex items-center justify-center shrink-0 transition-colors"
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 5,
                            background: checked ? 'var(--accent)' : 'transparent',
                            border: `1px solid ${checked ? 'var(--accent)' : 'var(--line-strong)'}`,
                          }}
                        >
                          {checked && <Check size={13} color="#fff" />}
                        </span>
                        <span className="text-sm">{ct.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <span className="field-label">Quantidade</span>
                <NumberRoller
                  value={count}
                  onChange={setCount}
                  min={1}
                  max={100}
                  suffix="cards"
                  ariaLabel="Quantidade de cards"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="g-lang">
                  Idioma dos cards
                </label>
                <select
                  id="g-lang"
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
                <label className="field-label" htmlFor="g-name">
                  Nome do deck
                </label>
                <input
                  id="g-name"
                  className="field"
                  value={deckName}
                  placeholder="Opcional (preenchido ao gerar)"
                  onChange={(e) => setDeckName(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="accent"
                icon={busy && !cards ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                onClick={generate}
                disabled={busy}
              >
                {busy && !cards ? 'Gerando...' : cards ? 'Gerar novamente' : 'Gerar cards'}
              </Button>
              {error && (
                <span className="mono text-[12px]" style={{ color: 'var(--accent)' }}>
                  {error}
                </span>
              )}
            </div>
          </Panel>

          {cards && (
            <Panel className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles size={16} className="text-accent" />
                <h2 className="mono text-sm text-muted">Revise antes de criar</h2>
              </div>
              <GeneratedCardsEditor
                cards={cards}
                onChange={setCards}
                onConfirm={confirm}
                busy={busy}
                confirmLabel="Criar deck"
              />
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
