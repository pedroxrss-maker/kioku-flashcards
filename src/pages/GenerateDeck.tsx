import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ClipboardList, FileText, Globe, Loader2, Sparkles, Type, Volume2, Wand2 } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Panel } from '../components/Panel';
import { Button } from '../components/Button';
import { Toggle } from '../components/Toggle';
import { NumberRoller } from '../components/NumberRoller';
import { Select } from '../components/Select';
import { GeneratedCardsEditor } from '../features/ai/GeneratedCardsEditor';
import { generateCards, isAiConfigured } from '../features/ai/client';
import { createDeckFromGenerated } from '../features/ai/cards';
import { fileToBase64 } from '../features/ai/readFile';
import { extractFromUrl } from '../features/ai/url';
import { generateDeckAudio } from '../features/tts/audioGen';
import type { AudioSide } from '../features/tts/audioGen';
import { GOOGLE_VOICES, groupGoogleVoices, isTtsConfigured } from '../features/tts/googleProvider';
import { useSettings } from '../db/hooks';
import { repo } from '../db/repositories';
import { pushToast } from '../lib/toast';
import type { GeneratedCard, GenerateSource } from '../features/ai/cards';
import type { CardType } from '../lib/cardType';

type Mode = 'topic' | 'notes' | 'pdf' | 'url';

const MODES: Array<{ id: Mode; label: string; icon: typeof Type }> = [
  { id: 'topic', label: 'Tema', icon: Type },
  { id: 'notes', label: 'Anotações', icon: ClipboardList },
  { id: 'pdf', label: 'PDF', icon: FileText },
  { id: 'url', label: 'URL', icon: Globe },
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
  const [notes, setNotes] = useState('');
  const [pdf, setPdf] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [instructions, setInstructions] = useState('');
  const [types, setTypes] = useState<CardType[]>(['basic']);
  const [count, setCount] = useState(20);
  const [language, setLanguage] = useState('Portuguese (Brazil)');
  const [deckName, setDeckName] = useState('');

  // Audio (TTS) options, applied to the cards right after the deck is created.
  const settings = useSettings();
  const [genAudio, setGenAudio] = useState(false);
  const [audioSide, setAudioSide] = useState<'front' | 'back' | 'both'>('front');
  const [audioVoice, setAudioVoice] = useState('');
  const [audioCross, setAudioCross] = useState(false);
  const [audioProgress, setAudioProgress] = useState<string | null>(null);
  const effVoice = audioVoice || settings?.tts.googleVoiceName || GOOGLE_VOICES[0]?.id || '';

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
    let urlTitle = '';
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
    } else if (mode === 'url') {
      if (!url.trim()) {
        setError('Informe uma URL (YouTube ou página da web).');
        return;
      }
      setBusy(true);
      try {
        const extracted = await extractFromUrl(url);
        source = { kind: 'text', text: extracted.text };
        urlTitle = extracted.title;
      } catch (e) {
        setBusy(false);
        setError(e instanceof Error ? e.message : 'Não foi possível obter o conteúdo da URL.');
        return;
      }
    } else {
      const text = (mode === 'topic' ? instructions : notes).trim();
      if (!text) {
        setError(
          mode === 'topic'
            ? 'Descreva o tema e as instruções para a IA.'
            : 'Cole o conteúdo para gerar os cards.',
        );
        return;
      }
      source = { kind: 'text', text };
      setBusy(true);
    }

    try {
      const aiInstructions = instructions.trim() || undefined;
      const result = await generateCards({ types, count, language, source, instructions: aiInstructions });
      setCards(result);
      if (!deckName.trim()) {
        const fallback =
          mode === 'pdf'
            ? pdf?.name.replace(/\.pdf$/i, '') ?? 'Deck gerado por IA'
            : mode === 'topic'
              ? instructions.trim().slice(0, 60)
              : mode === 'url'
                ? urlTitle || 'Deck gerado por IA'
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

      if (genAudio && isTtsConfigured()) {
        const s = await repo.getSettings();
        const v = GOOGLE_VOICES.find((x) => x.id === effVoice);
        const voice = v ? { voiceName: v.id, languageCode: v.lang ?? 'en-US' } : undefined;
        const sides: AudioSide[] = audioSide === 'both' ? ['front', 'back'] : [audioSide];
        let stopped = false;
        for (const side of sides) {
          const label = side === 'front' ? 'frente' : 'verso';
          const r = await generateDeckAudio(
            deck.id,
            s,
            (p) => setAudioProgress(`Gerando áudio (${label}) ${p.done}/${p.total}...`),
            side,
            voice,
          );
          if (r.stopped) stopped = true;
        }
        // Cross-side ("fonte"): the generated side's audio also plays on the other.
        if (audioCross && audioSide !== 'both') {
          const other: AudioSide = audioSide === 'front' ? 'back' : 'front';
          const cur = await repo.getSettings();
          const deckCards = await repo.listCards(deck.id);
          const map = { ...(cur.cardAudio ?? {}) };
          for (const c of deckCards) {
            const e = map[c.id];
            if (e && e[audioSide] && !e[other]) map[c.id] = { ...e, [other]: e[audioSide] };
          }
          await repo.saveSettings({ cardAudio: map });
        }
        setAudioProgress(null);
        pushToast(
          stopped ? 'error' : 'success',
          stopped ? 'Alguns áudios não foram gerados (verifique o TTS).' : 'Áudio gerado para os cards.',
        );
      }

      nav(`/decks/${deck.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao criar o deck.');
      setBusy(false);
      setAudioProgress(null);
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
                className="grid grid-cols-4 gap-1 p-1"
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
                {mode === 'url' && (
                  <div>
                    <label className="field-label" htmlFor="g-url">
                      URL (YouTube ou página da web)
                    </label>
                    <input
                      id="g-url"
                      className="field"
                      value={url}
                      placeholder="https://www.youtube.com/watch?v=..."
                      onChange={(e) => setUrl(e.target.value)}
                    />
                    <p className="text-[11px] text-muted mt-1" style={{ lineHeight: 1.5 }}>
                      Vídeos do YouTube usam a transcrição. Muitos sites bloqueiam o acesso direto
                      (CORS); se falhar, copie o texto e use o modo Anotações.
                    </p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {/* Instructions. In Tema mode this is the primary (required) input; in
                other modes it is optional guidance. It also overrides the default
                per-type mix: asking for an exact number of each card type is obeyed. */}
            <div>
              <label className="field-label" htmlFor="g-instructions">
                {mode === 'topic'
                  ? 'Tema e instruções para a IA'
                  : 'Instruções para a IA (opcional)'}
              </label>
              <textarea
                id="g-instructions"
                className="field"
                rows={mode === 'topic' ? 3 : 2}
                value={instructions}
                placeholder={
                  mode === 'topic'
                    ? 'Ex.: Verbos irregulares em inglês para iniciantes; faça 10 básicos e 10 cloze.'
                    : 'Ex.: faça 10 básicos, 5 cloze e 5 de escrever a resposta; foque no capítulo 3.'
                }
                onChange={(e) => setInstructions(e.target.value)}
              />
            </div>

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
                <Select
                  id="g-lang"
                  ariaLabel="Idioma dos cards"
                  value={language}
                  onChange={setLanguage}
                  options={LANGS.map(([value, label]) => ({ value, label }))}
                />
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

              {isTtsConfigured() && (
                <div className="mb-4 pb-4 border-b" style={{ borderColor: 'var(--line)' }}>
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <Volume2 size={16} className="text-muted shrink-0" />
                    <span className="text-sm flex-1 min-w-0">
                      Gerar áudio para os cards
                      <span className="block text-xs text-muted" style={{ lineHeight: 1.4 }}>
                        Sintetiza a voz (TTS) e anexa aos cards ao criar o deck.
                      </span>
                    </span>
                    <Toggle checked={genAudio} onChange={setGenAudio} />
                  </label>

                  <AnimatePresence initial={false}>
                    {genAudio && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                        style={{ overflow: 'hidden' }}
                      >
                        <div className="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <span className="field-label">Onde inserir o áudio</span>
                            <div
                              className="grid grid-cols-3 gap-1 p-1"
                              style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-sm)' }}
                            >
                              {(['front', 'back', 'both'] as const).map((sd) => {
                                const active = audioSide === sd;
                                return (
                                  <button
                                    key={sd}
                                    type="button"
                                    onClick={() => setAudioSide(sd)}
                                    className="relative py-1.5 text-sm rounded-[var(--r-sm)] transition-colors"
                                    style={{ color: active ? '#fff' : 'var(--muted)' }}
                                  >
                                    {active && (
                                      <motion.span
                                        layoutId="audioside-pill"
                                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                                        style={{ position: 'absolute', inset: 0, background: 'var(--accent)', borderRadius: 'var(--r-sm)', zIndex: 0 }}
                                      />
                                    )}
                                    <span style={{ position: 'relative', zIndex: 1 }}>
                                      {sd === 'front' ? 'Frente' : sd === 'back' ? 'Verso' : 'Ambos'}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div>
                            <label className="field-label" htmlFor="g-voice">
                              Voz
                            </label>
                            <select
                              id="g-voice"
                              className="field"
                              value={effVoice}
                              onChange={(e) => setAudioVoice(e.target.value)}
                            >
                              {groupGoogleVoices().map((g) => (
                                <optgroup key={g.lang} label={g.label}>
                                  {g.items.map((v) => (
                                    <option key={v.id} value={v.id}>
                                      {v.name}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                          </div>
                          {audioSide !== 'both' && (
                            <label className="sm:col-span-2 flex items-center gap-2.5 cursor-pointer select-none">
                              <span className="text-sm flex-1 min-w-0">
                                Tocar o mesmo áudio nos dois lados
                                <span className="block text-xs text-muted" style={{ lineHeight: 1.4 }}>
                                  {audioSide === 'front'
                                    ? 'O áudio gerado na frente também toca no verso.'
                                    : 'O áudio gerado no verso também toca na frente.'}
                                </span>
                              </span>
                              <Toggle checked={audioCross} onChange={setAudioCross} />
                            </label>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {audioProgress && (
                    <p className="text-xs mt-3" style={{ color: 'var(--accent)' }}>
                      {audioProgress}
                    </p>
                  )}
                </div>
              )}

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
