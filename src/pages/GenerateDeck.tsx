import { useEffect, useState } from 'react';
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
import { generateCards, isAiConfigured, QuotaError } from '../features/ai/client';
import { createDeckFromGenerated } from '../features/ai/cards';
import { useAuth } from '../features/auth/AuthContext';
import { aiDeckMaxCards } from '../features/usage/limits';
import { fileToBase64 } from '../features/ai/readFile';
import { extractFromUrl } from '../features/ai/url';
import { generateDeckAudio } from '../features/tts/audioGen';
import { recordFeatureUse } from '../features/gamification/achievements';
import { useUpgradeModal } from '../features/billing/UpgradeModalProvider';
import {
  appendImageHtml,
  atImageCap,
  generateCardImage,
  imageSideForType,
  imagesRemaining,
  isImageGenConfigured,
  recordImageGeneration,
} from '../features/ai/image';
import type { AudioSide } from '../features/tts/audioGen';
import type { Card } from '../db/types';
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

const CARD_TYPES: Array<{ id: CardType; label: string; hint?: string }> = [
  { id: 'basic', label: 'Básico', hint: 'frente e verso' },
  { id: 'cloze', label: 'Cloze', hint: 'ocultar palavra' },
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
  const { openUpgrade } = useUpgradeModal();
  const configured = isAiConfigured();
  // O plano do usuário limita o tamanho do deck gerado por IA (gratuito = 20).
  const { plan } = useAuth();
  const maxCards = aiDeckMaxCards(plan);

  const [mode, setMode] = useState<Mode>('topic');
  const [sourceDir, setSourceDir] = useState(0);
  const [notes, setNotes] = useState('');
  const [pdf, setPdf] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [instructions, setInstructions] = useState('');
  const [types, setTypes] = useState<CardType[]>(['basic']);
  const [count, setCount] = useState(20);
  // Nunca deixa a quantidade passar do teto do plano (ex.: free resolve em 20).
  useEffect(() => {
    setCount((c) => Math.min(c, maxCards));
  }, [maxCards]);
  const [language, setLanguage] = useState('Portuguese (Brazil)');
  const [deckName, setDeckName] = useState('');

  // Audio (TTS) options, applied to the cards right after the deck is created.
  const settings = useSettings();
  const [genAudio, setGenAudio] = useState(false);
  const [audioSide, setAudioSide] = useState<'front' | 'back' | 'both'>('front');
  const [audioVoice, setAudioVoice] = useState('');
  const [audioCross, setAudioCross] = useState(false);
  const [audioProgress, setAudioProgress] = useState<{ label: string; done: number; total: number } | null>(null);
  const effVoice = audioVoice || settings?.tts.googleVoiceName || GOOGLE_VOICES[0]?.id || '';

  const [cards, setCards] = useState<GeneratedCard[] | null>(null);
  const [busy, setBusy] = useState(false);
  // Distinguishes the "creating the deck" phase (after the review) from the
  // "generating cards" phase, since both set `busy` while `cards` is present
  // (e.g. "Gerar novamente"). Drives the creation progress bar.
  const [creating, setCreating] = useState(false);
  const [imageProgress, setImageProgress] = useState<{ done: number; total: number } | null>(null);
  // Bumped on each (re)generation so the cards editor clears its image selection.
  const [genNonce, setGenNonce] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pdfDragOver, setPdfDragOver] = useState(false);

  /** Validate + accept a PDF from the picker OR a drag-and-drop. */
  function acceptPdf(file: File) {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setError('Selecione um arquivo PDF.');
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError('O PDF excede 15 MB.');
      return;
    }
    setError(null);
    setPdf(file);
  }

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
      // O plano limita as cartas por deck: pede no máximo `maxCards` e ainda
      // corta o resultado, então instruções como "faça 50 cards" não furam o teto.
      const result = await generateCards({
        types,
        count: Math.min(count, maxCards),
        language,
        source,
        instructions: aiInstructions,
      });
      setCards(result.slice(0, maxCards));
      setGenNonce((n) => n + 1); // clears the editor's image selection
      void recordFeatureUse('aigen');
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
      // Free user hit the AI limit → upsell modal instead of a dead-end error.
      if (e instanceof QuotaError && openUpgrade(e.info.metric)) return;
      setError(e instanceof Error ? e.message : 'Falha ao gerar os cards.');
    } finally {
      setBusy(false);
    }
  }

  async function confirm(imageIndices: number[]) {
    if (!cards) return;
    setBusy(true);
    setCreating(true);
    setError(null);
    try {
      const { deck, cards: createdCards } = await createDeckFromGenerated(deckName, cards, { language });

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
            (p) => setAudioProgress({ label: `Gerando áudio (${label})`, done: p.done, total: p.total }),
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

      // AI images for the cards the user picked, respecting the provisional cap.
      // Sequential (one at a time) to avoid hammering the API; failures are
      // counted and skipped, never aborting the rest or crashing.
      if (isImageGenConfigured() && imageIndices.length > 0) {
        // Map an original card index to its created card (aligned to the
        // non-empty input order createDeckFromGenerated used).
        const indexToCard = new Map<number, Card>();
        let j = 0;
        cards.forEach((c, i) => {
          if (c.front.trim() || c.back.trim()) {
            indexToCard.set(i, createdCards[j]);
            j += 1;
          }
        });
        const s = await repo.getSettings();
        const targets = imageIndices
          .map((i) => ({ card: indexToCard.get(i), type: cards[i]?.type }))
          .filter((t): t is { card: Card; type: GeneratedCard['type'] } => !!t.card && !!t.type);
        const total = Math.min(targets.length, imagesRemaining(s));
        // Respect the remaining cap up front: never start more than allowed.
        const batch = targets.slice(0, total);
        let made = 0;
        let failed = 0;
        let done = 0;
        setImageProgress({ done: 0, total });

        // Generate concurrently with a SMALL pool so several images overlap (much
        // faster than one-at-a-time) WITHOUT hammering OpenAI into 429s. Each task
        // owns its try/catch — one failure never aborts the batch — and bumps the
        // progress as it settles. updateCard stays per card (each image URL saved).
        const CONCURRENCY = 3;
        const runTask = (t: { card: Card; type: GeneratedCard['type'] }): Promise<void> =>
          generateCardImage({ front: t.card.front, back: t.card.back, deckId: deck.id })
            .then(async (img) => {
              const side = imageSideForType(t.type);
              const patch: Partial<Card> =
                side === 'front'
                  ? { front: appendImageHtml(t.card.front, img.path) }
                  : { back: appendImageHtml(t.card.back, img.path) };
              await repo.updateCard(t.card.id, patch);
              made += 1;
            })
            .catch((err) => {
              // Free user without image quota → open the upsell (once is enough).
              if (err instanceof QuotaError) openUpgrade(err.info.metric);
              failed += 1;
            })
            .finally(() => {
              done += 1;
              setImageProgress({ done, total });
            });

        // Worker pool: each worker claims the next index SYNCHRONOUSLY (before the
        // await) so two workers never grab the same card; at most CONCURRENCY run
        // at once. allSettled never rejects, so the batch always completes.
        let cursor = 0;
        const worker = async (): Promise<void> => {
          while (cursor < batch.length) {
            const i = cursor;
            cursor += 1;
            await runTask(batch[i]);
          }
        };
        await Promise.allSettled(
          Array.from({ length: Math.min(CONCURRENCY, batch.length) }, () => worker()),
        );

        // Increment the provisional global counter ONCE by the number made — the
        // atomic server-side quota in image-proxy already counted each image, so a
        // per-task +1 here would race and lose updates.
        if (made > 0) await recordImageGeneration(made);

        setImageProgress(null);
        // feat_image, event-driven (counter in settings) → instant, no card scan.
        if (made > 0) void recordFeatureUse('image');
        if (made > 0 || failed > 0) {
          pushToast(
            failed > 0 ? 'error' : 'success',
            failed > 0
              ? `${made} ${made === 1 ? 'imagem gerada' : 'imagens geradas'}, ${failed} falharam.`
              : `${made} ${made === 1 ? 'imagem gerada' : 'imagens geradas'} para os cards.`,
          );
        }
      }

      nav(`/decks/${deck.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao criar o deck.');
      setBusy(false);
      setCreating(false);
      setAudioProgress(null);
      setImageProgress(null);
    }
  }

  // The creation progress bar shows image generation, else audio, else a steady
  // "Criando seu deck..." fill.
  const barProgress = imageProgress
    ? { label: 'Gerando imagens', done: imageProgress.done, total: imageProgress.total }
    : audioProgress
      ? { label: audioProgress.label, done: audioProgress.done, total: audioProgress.total }
      : null;

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
                      className="relative py-1.5 px-1 sm:px-2 rounded-[var(--r-sm)] text-center transition-colors inline-flex items-center justify-center min-w-0"
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
                      {/* Em telas estreitas o ícone fica ACIMA do rótulo (e o texto
                          menor), senão "Anotações" estoura a célula de 1/4 e os
                          rótulos se sobrepõem. A partir de sm volta lado a lado. */}
                      <span className="relative z-[1] inline-flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 min-w-0">
                        <Icon size={14} className="shrink-0" />
                        <span className="text-[11px] sm:text-sm font-semibold leading-tight">{m.label}</span>
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
                      className="flex items-center gap-3 cursor-pointer surface p-3 transition-colors"
                      style={{
                        borderStyle: 'dashed',
                        borderColor: pdfDragOver ? 'var(--accent)' : undefined,
                        background: pdfDragOver ? 'var(--accent-soft)' : undefined,
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (!pdfDragOver) setPdfDragOver(true);
                      }}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                          setPdfDragOver(false);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setPdfDragOver(false);
                        const f = e.dataTransfer.files?.[0];
                        if (f) acceptPdf(f);
                      }}
                    >
                      <FileText size={18} className="text-muted shrink-0" />
                      <span className="text-sm flex-1 min-w-0 truncate">
                        {pdfDragOver
                          ? 'Solte o PDF aqui'
                          : pdf
                            ? pdf.name
                            : 'Escolher um PDF ou arraste aqui (até 15 MB)'}
                      </span>
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        hidden
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) acceptPdf(f);
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
                        <span className="text-sm">
                          {ct.label}
                          {ct.hint && <span className="text-muted"> ({ct.hint})</span>}
                        </span>
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
                  max={maxCards}
                  suffix="cards"
                  ariaLabel="Quantidade de cards"
                />
                {plan === 'free' && (
                  <p className="text-[11px] text-muted mt-1.5" style={{ lineHeight: 1.4 }}>
                    Plano gratuito: até {maxCards} cartas por deck gerado.
                  </p>
                )}
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

            {/* Generation progress: a filling bar + "don't leave" warning. */}
            <AnimatePresence initial={false}>
              {busy && !cards && (
                <motion.div
                  key="gen-loading"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  style={{ overflow: 'hidden' }}
                >
                  <div
                    className="mt-4 p-4 rounded-[var(--r-md)]"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}
                  >
                    <div className="flex items-center gap-2 mb-2.5">
                      <Loader2 size={15} className="animate-spin" style={{ color: 'var(--accent)' }} />
                      <span className="text-sm font-semibold">Gerando seus cards com IA...</span>
                    </div>
                    <div
                      style={{ height: 8, borderRadius: 999, background: 'var(--surface)', overflow: 'hidden' }}
                    >
                      <motion.div
                        initial={{ width: '6%' }}
                        animate={{ width: '92%' }}
                        transition={{ duration: 20, ease: 'easeOut' }}
                        style={{ height: '100%', borderRadius: 999, background: 'var(--accent)' }}
                      />
                    </div>
                    <p className="text-xs text-muted mt-2.5" style={{ lineHeight: 1.5 }}>
                      Isso pode levar alguns segundos.{' '}
                      <b className="text-fg">Não saia desta tela</b> enquanto o deck é gerado.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
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
                </div>
              )}

              <GeneratedCardsEditor
                cards={cards}
                onChange={setCards}
                onConfirm={confirm}
                busy={busy}
                confirmLabel="Criar deck"
                imagesEnabled={isImageGenConfigured()}
                imagesRemaining={imagesRemaining(settings)}
                atImageCap={atImageCap(settings)}
                resetKey={genNonce}
              />

              {/* Creation progress: the same filling bar shown before the review.
                  It tracks audio generation when that runs (done/total), else a
                  steady fill while the deck + cards are saved. */}
              <AnimatePresence initial={false}>
                {creating && (
                  <motion.div
                    key="create-loading"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div
                      className="mt-4 p-4 rounded-[var(--r-md)]"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}
                    >
                      <div className="flex items-center gap-2 mb-2.5">
                        <Loader2 size={15} className="animate-spin" style={{ color: 'var(--accent)' }} />
                        <span className="text-sm font-semibold">
                          {barProgress
                            ? `${barProgress.label} ${barProgress.done}/${barProgress.total}...`
                            : 'Criando seu deck...'}
                        </span>
                      </div>
                      <div style={{ height: 8, borderRadius: 999, background: 'var(--surface)', overflow: 'hidden' }}>
                        {barProgress && barProgress.total > 0 ? (
                          <motion.div
                            key={barProgress.label}
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.round((barProgress.done / barProgress.total) * 100)}%` }}
                            transition={{ duration: 0.3, ease: 'easeOut' }}
                            style={{ height: '100%', borderRadius: 999, background: 'var(--accent)' }}
                          />
                        ) : (
                          <motion.div
                            initial={{ width: '8%' }}
                            animate={{ width: '90%' }}
                            transition={{ duration: 6, ease: 'easeOut' }}
                            style={{ height: '100%', borderRadius: 999, background: 'var(--accent)' }}
                          />
                        )}
                      </div>
                      <p className="text-xs text-muted mt-2.5" style={{ lineHeight: 1.5 }}>
                        <b className="text-fg">Não saia desta tela</b> enquanto o deck é criado.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
