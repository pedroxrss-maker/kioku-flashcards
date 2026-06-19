import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useReducedMotion } from '../lib/useReducedMotion';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Pencil, RotateCcw, X, Zap } from 'lucide-react';
import { BackLink } from '../components/BackLink';
import { useReviewSession } from '../features/review/useReviewSession';
import { AnswerButtons } from '../features/review/AnswerButtons';
import { buttonsFor } from '../features/review/buttons';
import { FlipCard } from '../features/review/FlipCard';
import { ClozeCard } from '../features/review/ClozeCard';
import { TypeInCard } from '../features/review/TypeInCard';
import { Confetti } from '../features/review/Confetti';
import { XP_REWARDS, levelForXp } from '../features/gamification/xp';
import { celebrate } from '../features/gamification/celebration';
import { scheduleAchievementCheck } from '../features/gamification/achievements';
import { cardTypeOf } from '../lib/cardType';
import { CardEditorModal } from '../features/decks/CardEditorModal';
import { CardAiHelp } from '../features/ai/CardAiHelp';
import { useGamification, useSettings } from '../db/hooks';
import { repo } from '../db/repositories';
import { stripHtml } from '../lib/text';
import { prefetchMediaHtml } from '../features/media/media';
import { deckAudioEnabled } from '../lib/deckAudio';
import { faceAudioUrl, faceHasAudio } from '../features/tts/cardAudio';

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
  const gamification = useGamification();
  const session = useReviewSession(deckId);
  const { deck, currentDeck, current, next, flipped, preview, counters, canUndo, flip, rate, undo, updateCurrentCard } = session;
  const [editOpen, setEditOpen] = useState(false);
  // XP is awarded once when a session completes; `award.leveledUp` lets the
  // completion screen mute the confetti pop on a level-up (the banner chimes).
  const awardedRef = useRef(false);
  const [award, setAward] = useState<{ leveledUp: boolean } | null>(null);
  const cardWrapRef = useRef<HTMLDivElement>(null);
  const storedAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastAutoPlayedId = useRef<string | null>(null);
  const [frontAudioUrl, setFrontAudioUrl] = useState<string | null>(null);
  const [backAudioUrl, setBackAudioUrl] = useState<string | null>(null);
  const reduce = useReducedMotion();

  // The current card's own deck drives audio + TTS language (in a parent session
  // each subdeck card keeps its own settings); falls back to the display deck.
  const audioDeck = currentDeck ?? deck;
  // Type-in cards own their UI (input + Enter), so the global reveal/grade bar is
  // hidden for them.
  const isTypeIn = !!current && cardTypeOf(current.front) === 'typein';
  // Grouping-parent sessions use a synthetic "group:" id that isn't a real deck
  // route, so return to the deck list instead of a non-existent detail page.
  const exitTo = deckId && !deckId.startsWith('group:') ? `/decks/${deckId}` : '/decks';
  const location = useLocation();
  // "Sair" returns to exactly the screen the user came from (history back). Falls
  // back to the deck page when the session was opened directly (no history).
  const goBack = () => {
    if (location.key && location.key !== 'default') nav(-1);
    else nav(exitTo);
  };

  // Keyboard: space/enter flip; 1..N rate after reveal; Esc exit.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (editOpen) return; // the editor owns its keys while open
      if (e.key === 'Escape') {
        goBack();
        return;
      }
      // While typing an answer (type-in card), let the input own the keys.
      const ae = document.activeElement as HTMLElement | null;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) {
        return;
      }
      // "U" or Ctrl/Cmd+Z undoes the last rating and brings the previous card
      // back, even after it was reviewed (and even on the completion screen).
      if (e.key === 'u' || e.key === 'U' || ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z'))) {
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
      // "R" replays the visible face's audio (back when revealed, else front).
      if (e.key === 'r' || e.key === 'R') {
        if (flipped && backAudioUrl) {
          e.preventDefault();
          replayBackAudio();
          return;
        }
        if (frontAudioUrl) {
          e.preventDefault();
          replayFrontAudio();
          return;
        }
      }
      // Type-in cards own their keyboard (the focused input handles Enter); the
      // global flip/rate shortcuts must not reveal or rate them.
      if (cardTypeOf(current.front) === 'typein') return;
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
  }, [current, flipped, deck, flip, rate, undo, nav, exitTo, editOpen, frontAudioUrl, backAudioUrl]);

  // Resolve EACH face's audio as a card appears, and auto-play the front:
  //   - A face's audio is the generated audio (cards.audio_path) made for THAT
  //     side, or an attached kioku-audio:// chip on that side. It is deliberate
  //     content, so it plays regardless of the deck's TTS toggle.
  //   - With no front audio, fall back to Web Speech (TTS), gated by the deck
  //     audio toggle + the global "Ativar pronúncia".
  // Both honor "Pronunciar a frente ao aparecer" and the per-card mute. Each
  // face URL is kept in state so its speaker button can replay it.
  useEffect(() => {
    if (!current || !audioDeck || !settings) {
      setFrontAudioUrl(null);
      setBackAudioUrl(null);
      return;
    }
    let cancelled = false;

    const stopStored = () => {
      const a = storedAudioRef.current;
      if (a) {
        try {
          a.pause();
        } catch {
          /* ignore */
        }
        storedAudioRef.current = null;
      }
    };
    const play = (url: string) => {
      stopStored();
      const a = new Audio(url);
      storedAudioRef.current = a;
      void a.play().catch(() => {});
    };
    // Auto-play only the FIRST time a card appears, not when this effect re-runs
    // because the SAME card was re-resolved after an inline edit (audio added or
    // removed). That keeps the audio buttons live without replaying on edit.
    const isNewCard = lastAutoPlayedId.current !== current.id;
    const autoPlay =
      isNewCard &&
      settings.tts.enabled &&
      settings.tts.autoPronounceFront &&
      settings.mutedCards?.[current.id] !== true;

    void (async () => {
      const [frontUrl, backUrl] = await Promise.all([
        faceAudioUrl(current, 'front', settings),
        faceAudioUrl(current, 'back', settings),
      ]);
      if (cancelled) return;
      setFrontAudioUrl(frontUrl);
      setBackAudioUrl(backUrl);
      if (autoPlay) {
        lastAutoPlayedId.current = current.id;
        if (frontUrl) play(frontUrl);
      }
    })();

    return () => {
      cancelled = true;
      stopStored();
    };
    // Re-resolve when the card's audio-relevant data changes (e.g. removed in the
    // inline editor), so the buttons reflect it without a page reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, current?.audioPath, current?.front, current?.back]);

  // Replay a face's audio from the start (its speaker button).
  const playStored = (url: string | null) => {
    if (!url) return;
    const a = storedAudioRef.current;
    if (a) {
      try {
        a.pause();
      } catch {
        /* ignore */
      }
    }
    const next = new Audio(url);
    storedAudioRef.current = next;
    void next.play().catch(() => {});
  };
  const replayFrontAudio = () => playStored(frontAudioUrl);
  const replayBackAudio = () => playStored(backAudioUrl);

  // Audio buttons appear only when the global pronunciation toggle is on AND the
  // face has its own generated/attached track (the old Web Speech voice is gone).
  const hasFrontAudio = !!settings?.tts.enabled && !!current && faceHasAudio(current, 'front', settings);
  const hasBackAudio = !!settings?.tts.enabled && !!current && faceHasAudio(current, 'back', settings);

  // Type-in cards: auto-play the answer (back) audio once it is revealed.
  const autoPlayedBackId = useRef<string | null>(null);
  useEffect(() => {
    if (!current || !flipped || !backAudioUrl) return;
    if (cardTypeOf(current.front) !== 'typein') return;
    if (!settings?.tts.enabled || settings.mutedCards?.[current.id] === true) return;
    if (autoPlayedBackId.current === current.id) return;
    autoPlayedBackId.current = current.id;
    replayBackAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped, current?.id, backAudioUrl]);

  // Warm the NEXT card's images while the current one is on screen, so advancing
  // never flashes blank (its signed URL + bytes are cached by then). Keyed by the
  // next card object, which changes only when the upcoming card actually changes.
  useEffect(() => {
    if (!next) return;
    void prefetchMediaHtml(next.front);
    void prefetchMediaHtml(next.back);
  }, [next]);

  // Award XP once the session finishes (XP_REWARDS.reviewCard per card rated),
  // then celebrate a level-up. Level-up is decided from the warm cached XP/level
  // so the choice is instant; the persist is fire-and-forget (repo.addXp also
  // updates the cache). Runs once (awardedRef); waits for the cached state.
  useEffect(() => {
    if (!session.done || counters.total <= 0 || awardedRef.current) return;
    if (!gamification) return;
    awardedRef.current = true;
    const gained = counters.total * XP_REWARDS.reviewCard;
    const newXp = gamification.totalXp + gained;
    const newLevel = levelForXp(newXp);
    const leveledUp = newLevel > gamification.level;
    setAward({ leveledUp });
    void repo.addXp(gained);
    if (leveledUp) {
      celebrate({
        kind: 'levelup',
        title: `Nível ${newLevel}!`,
        message: `Você alcançou o nível ${newLevel}. Continue assim.`,
      });
    }
    // Re-check achievements after the session (debounced so the last saveReview
    // lands first). A level-up banner queues ahead of any new-achievement ones.
    scheduleAchievementCheck();
  }, [session.done, counters.total, gamification]);

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
        {/* Confetti waits until XP is tallied (`award`) so a level-up can mute the
            pop — on a level-up the banner owns the chime instead. */}
        {award && reviewed > 0 && (
          <Confetti sound={!award.leveledUp && settings?.celebrationSound !== false} />
        )}
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
          <BackLink onClick={goBack}>Sair</BackLink>
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
        {/* O card fica ancorado pelo próprio centro: a dica (acima), os botões de
            IA (abaixo) e o balão de resposta (à direita, no xl) são absolutos,
            então nunca deslocam o card nem cobrem as notas. O wrapper tem a
            largura do card (max-w-2xl) para o balão ancorar na borda direita. */}
        <div className="relative w-full max-w-2xl">
          {!flipped && current && cardTypeOf(current.front) !== 'typein' && (
            <p
              className="absolute left-0 right-0 text-center mono text-[11px] text-muted animate-pulse"
              style={{ bottom: '100%', marginBottom: 16 }}
            >
              Clique ou pressione espaço para revelar
            </p>
          )}
        {/* Animate card hand-off: the answered card eases out (up + fade) and the
            next one rises in, so advancing never feels abrupt. mode="wait" keeps a
            single card on screen; the queue itself advances instantly (queueRef),
            so rapid keyboard rating is never blocked by the animation. */}
        <AnimatePresence mode="wait">
          {current && (
            <motion.div
              // Remount on every advance (incl. same card recurring after a lapse)
              // so the incoming card always starts on its front, no back-flash.
              key={`${current.id}:${counters.total}`}
              className="w-full flex justify-center relative"
              style={{ zIndex: 1 }}
              initial={reduce ? false : { opacity: 0, y: 26, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={
                reduce
                  ? { opacity: 0 }
                  : { opacity: 0, y: -26, scale: 0.94, transition: { duration: 0.15, ease: [0.4, 0, 1, 1] } }
              }
              transition={{ duration: reduce ? 0 : 0.26, ease: [0.22, 1, 0.36, 1] }}
            >
              {(() => {
                const type = cardTypeOf(current.front);
                const audioOn = deckAudioEnabled(settings, (audioDeck ?? deck).id);
                if (type === 'cloze') {
                  return (
                    <ClozeCard
                      front={current.front}
                      back={current.back}
                      revealed={flipped}
                      onReveal={flip}
                      audioEnabled={audioOn}
                      hasFrontAudio={hasFrontAudio}
                      onReplayFrontAudio={replayFrontAudio}
                      hasBackAudio={hasBackAudio}
                      onReplayBackAudio={replayBackAudio}
                    />
                  );
                }
                if (type === 'typein') {
                  return (
                    <TypeInCard
                      front={current.front}
                      back={current.back}
                      revealed={flipped}
                      onReveal={flip}
                      onResolve={rate}
                      audioEnabled={audioOn}
                      hasFrontAudio={hasFrontAudio}
                      onReplayFrontAudio={replayFrontAudio}
                      hasBackAudio={hasBackAudio}
                      onReplayBackAudio={replayBackAudio}
                    />
                  );
                }
                return (
                  <FlipCard
                    front={current.front}
                    back={current.back}
                    flipped={flipped}
                    onFlip={flip}
                    audioEnabled={audioOn}
                    hasFrontAudio={hasFrontAudio}
                    onReplayFrontAudio={replayFrontAudio}
                    hasBackAudio={hasBackAudio}
                    onReplayBackAudio={replayBackAudio}
                  />
                );
              })()}
            </motion.div>
          )}
        </AnimatePresence>

          {/* IA no verso: botões surgem a partir do card e a resposta abre num
              balão à direita (xl) ou folha inferior. O componente fica MONTADO
              durante todo o card (key = id:total), então o cache das respostas
              persiste ao olhar a frente, os elementos saem com fade, e só um card
              novo (nova key) zera tudo. Ele decide o que mostrar via `flipped`. */}
          {current && (
            <CardAiHelp
              key={`${current.id}:${counters.total}`}
              flipped={flipped}
              front={stripHtml(current.front)}
              back={stripHtml(current.back)}
            />
          )}
        </div>
      </div>

      {/* Bottom */}
      <div className="px-4 md:px-6 pb-6 pt-2 shrink-0 w-full max-w-2xl mx-auto">
        {isTypeIn ? (
          flipped && preview ? (
            <AnswerButtons
              buttonCount={REVIEW_BUTTONS}
              preview={preview}
              onRate={rate}
              showIntervals={settings?.showAnswerIntervals !== false}
            />
          ) : (
            <p className="mono text-[11px] text-muted text-center py-3">
              Digite a resposta e pressione Enter
            </p>
          )
        ) : (
        <AnimatePresence mode="wait" initial={false}>
          {!flipped ? (
            <motion.button
              key="show"
              className="btn-mega w-full"
              style={{ minHeight: 112 }}
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
        )}
      </div>

      {/* Inline editor for the current card ("E"), without leaving the session */}
      {current && (
        <CardEditorModal
          open={editOpen}
          onClose={async () => {
            setEditOpen(false);
            const fresh = await repo.getCard(current.id);
            if (fresh) {
              updateCurrentCard({
                front: fresh.front,
                back: fresh.back,
                audioPath: fresh.audioPath ?? null,
              });
            }
          }}
          deckId={current.deckId}
          card={current}
        />
      )}
    </motion.div>
  );
}
