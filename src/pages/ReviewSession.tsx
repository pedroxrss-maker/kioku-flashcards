import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Pencil, RotateCcw, X, Zap } from 'lucide-react';
import { useReviewSession } from '../features/review/useReviewSession';
import { AnswerButtons } from '../features/review/AnswerButtons';
import { buttonsFor } from '../features/review/buttons';
import { FlipCard } from '../features/review/FlipCard';
import { CardEditorModal } from '../features/decks/CardEditorModal';
import { useSettings } from '../db/hooks';
import { repo } from '../db/repositories';
import { tts } from '../features/tts/tts';
import { stripHtml } from '../lib/text';
import { deckAudioEnabled } from '../lib/deckAudio';

// All decks use 4 answer buttons (the King of Buttons option was removed).
const REVIEW_BUTTONS = 4 as const;

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function ReviewSession() {
  const { deckId } = useParams();
  const nav = useNavigate();
  const settings = useSettings();
  const session = useReviewSession(deckId);
  const { deck, currentDeck, current, flipped, preview, counters, canUndo, flip, rate, undo, updateCurrentCard } = session;
  const [editOpen, setEditOpen] = useState(false);
  const cardWrapRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  // The current card's own deck drives audio + TTS language (in a parent session
  // each subdeck card keeps its own settings); falls back to the display deck.
  const audioDeck = currentDeck ?? deck;
  // Grouping-parent sessions use a synthetic "group:" id that isn't a real deck
  // route — return to the deck list instead of a non-existent detail page.
  const exitTo = deckId && !deckId.startsWith('group:') ? `/decks/${deckId}` : '/decks';

  // Keyboard: space/enter flip; 1..N rate after reveal; Esc exit.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (editOpen) return; // the editor handles its own keys while open
      if (e.key === 'Escape') {
        nav(exitTo);
        return;
      }
      // "U" undoes the last rating and brings the previous card back, even after
      // it was reviewed (and even on the completion screen).
      if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        undo();
        return;
      }
      if (!current) return;
      // "E" edits the current card inline, without leaving the session.
      if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        setEditOpen(true);
        return;
      }
      if (!flipped) {
        if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          flip();
        }
        return;
      }
      // revealed
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        rate('good');
        return;
      }
      const n = Number(e.key);
      if (deck && n >= 1 && n <= REVIEW_BUTTONS) {
        e.preventDefault();
        const def = buttonsFor(REVIEW_BUTTONS)[n - 1];
        rate(def.rating);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, flipped, deck, flip, rate, undo, nav, exitTo, editOpen]);

  // Pronounce the front as soon as a card appears. Cards with a stored audio
  // chip (e.g. ElevenLabs) play it offline with no key; text-only cards fall back
  // to Web Speech. The audio chip's object URL resolves asynchronously, so for
  // audio cards we poll briefly until the <audio> element is in the DOM.
  useEffect(() => {
    if (!current || !audioDeck) return;
    if (!deckAudioEnabled(settings, audioDeck.id)) return; // deck has audio disabled
    if (!settings?.tts.autoPronounceFront) return;
    if (settings.mutedCards?.[current.id]) return; // card opted out of pronunciation

    const hasAudio = current.front.includes('kioku-audio://');

    if (!hasAudio) {
      if (settings.tts.enabled) {
        const text = stripHtml(current.front);
        if (text) {
          void tts.speak(text, {
            lang: audioDeck.ttsLang,
            voiceURI: settings.tts.voiceURI,
            rate: settings.tts.rate,
          });
        }
      }
      return;
    }

    let cancelled = false;
    let tries = 0;
    const playWhenReady = () => {
      if (cancelled) return;
      const el = cardWrapRef.current?.querySelector<HTMLAudioElement>(
        '.flip-face:not(.flip-face-back) audio',
      );
      if (el) {
        try {
          el.currentTime = 0;
        } catch {
          /* not loaded yet */
        }
        void el.play().catch(() => {});
        return;
      }
      if (tries++ < 12) window.setTimeout(playWhenReady, 90);
    };
    playWhenReady();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  if (session.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="mono text-muted text-sm">Carregando…</p>
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-muted">Deck não encontrado.</p>
        <Link to="/" className="btn btn-ghost">
          <ArrowLeft size={16} /> Início
        </Link>
      </div>
    );
  }

  // Completion / empty state.
  if (session.done) {
    const reviewed = counters.total;
    const accuracy = reviewed
      ? Math.round(((reviewed - counters.again) / reviewed) * 100)
      : 0;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-5 rise">
        <div className="text-center">
          <Check size={40} className="mx-auto text-accent-green mb-3" style={{ color: 'var(--accent-green)' }} />
          <h1 className="display text-3xl">
            {reviewed > 0 ? 'Sessão concluída' : 'Nada para revisar'}
          </h1>
          <p className="text-muted mt-2">
            {reviewed > 0
              ? `Você revisou ${reviewed} ${reviewed === 1 ? 'card' : 'cards'} em ${formatDuration(Date.now() - session.startedAt)}.`
              : 'Este deck está em dia. Volte mais tarde ou adicione novos cards.'}
          </p>
        </div>

        {reviewed > 0 && (
          <div className="grid grid-cols-4 gap-2 w-full max-w-md text-center">
            {[
              ['Aproveit.', `${accuracy}%`, 'var(--fg)'],
              ['Acertei', counters.good + counters.easy, 'var(--accent-green)'],
              ['Difícil', counters.hard, 'var(--accent-amber)'],
              ['Errei', counters.again, 'var(--accent)'],
            ].map(([label, val, color]) => (
              <div key={label as string} className="surface p-3">
                <p className="display text-xl" style={{ color: color as string }}>
                  {val}
                </p>
                <p className="mono text-[9px] text-muted mt-1">{label}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3">
          <Link to={exitTo} className="btn btn-ghost">
            <ArrowLeft size={16} /> Voltar ao deck
          </Link>
          {reviewed > 0 && (
            <button className="btn btn-accent" onClick={() => window.location.reload()}>
              <RotateCcw size={16} /> Revisar de novo
            </button>
          )}
        </div>
      </div>
    );
  }

  const counterChips = (
    <div className="flex items-center gap-3 mono text-xs">
      <span className="inline-flex items-center gap-1" style={{ color: 'var(--accent-green)' }}>
        <Check size={13} /> {counters.good + counters.easy}
      </span>
      <span className="inline-flex items-center gap-1" style={{ color: 'var(--accent-amber)' }}>
        {counters.hard}
      </span>
      <span className="inline-flex items-center gap-1" style={{ color: 'var(--accent)' }}>
        <X size={13} /> {counters.again}
      </span>
    </div>
  );

  return (
    <motion.div
      className="min-h-screen flex flex-col"
      // Slow, modern page build-in when the session opens (first card no longer
      // appears abruptly).
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Top bar */}
      <header
        className="flex items-center justify-between gap-3 px-4 md:px-6 h-14 border-b shrink-0"
        style={{ borderColor: 'var(--line)' }}
      >
        <div className="flex items-center gap-1">
          <button
            onClick={() => nav(exitTo)}
            className="mono text-xs text-muted hover:text-fg inline-flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft size={15} /> Sair
          </button>
          {canUndo && (
            <button
              onClick={undo}
              aria-label="Voltar ao card anterior (U)"
              title="Voltar ao card anterior (U)"
              className="p-1.5 rounded-[var(--r-sm)] text-muted hover:text-fg hover:bg-[color:var(--surface-2)] transition-colors"
            >
              <RotateCcw size={15} />
            </button>
          )}
          {current && (
            <button
              onClick={() => setEditOpen(true)}
              aria-label="Editar este card (E)"
              title="Editar este card (E)"
              className="p-1.5 rounded-[var(--r-sm)] text-muted hover:text-fg hover:bg-[color:var(--surface-2)] transition-colors"
            >
              <Pencil size={15} />
            </button>
          )}
        </div>
        <div className="text-center min-w-0">
          <p className="font-bold truncate text-sm" style={{ maxWidth: '50vw' }}>
            {deck.name}
          </p>
          <p className="mono text-[10px] text-muted">
            {settings?.showRemainingCount !== false
              ? `Card ${session.position} de ${session.total}`
              : `Card ${session.position}`}
          </p>
        </div>
        {counterChips}
      </header>

      {/* Card */}
      <div ref={cardWrapRef} className="flex-1 flex flex-col items-center justify-center px-4 py-6">
        {!flipped && (
          <p className="mono text-[11px] text-muted mb-4 animate-pulse">
            Clique ou pressione espaço para revelar
          </p>
        )}
        {current && (
          <FlipCard
            // Remount on every advance (incl. same card recurring after a lapse)
            // so the incoming card always starts on its front, no back-flash.
            key={`${current.id}:${counters.total}`}
            front={current.front}
            back={current.back}
            ttsLang={(audioDeck ?? deck).ttsLang}
            flipped={flipped}
            onFlip={flip}
            audioEnabled={deckAudioEnabled(settings, (audioDeck ?? deck).id)}
          />
        )}
      </div>

      {/* Bottom */}
      <div className="px-4 md:px-6 pb-6 pt-2 shrink-0 w-full max-w-2xl mx-auto">
        <AnimatePresence mode="wait" initial={false}>
          {!flipped ? (
            <motion.button
              key="show"
              className="btn-mega w-full"
              onClick={flip}
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10 }}
              transition={{ duration: reduce ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
            >
              <Zap size={18} /> Mostrar resposta
            </motion.button>
          ) : (
            preview && (
              <motion.div
                key="answers"
                initial={reduce ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
                transition={{ duration: reduce ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                <AnswerButtons
                  buttonCount={REVIEW_BUTTONS}
                  preview={preview}
                  onRate={rate}
                  showIntervals={settings?.showAnswerIntervals !== false}
                />
              </motion.div>
            )
          )}
        </AnimatePresence>
      </div>

      {/* Inline editor for the current card ("E"), without leaving the session */}
      {current && (
        <CardEditorModal
          open={editOpen}
          onClose={async () => {
            setEditOpen(false);
            const fresh = await repo.getCard(current.id);
            if (fresh) updateCurrentCard({ front: fresh.front, back: fresh.back });
          }}
          deckId={current.deckId}
          card={current}
          ttsLang={(audioDeck ?? deck).ttsLang}
        />
      )}
    </motion.div>
  );
}
