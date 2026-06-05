import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, RotateCcw, X, Zap } from 'lucide-react';
import { useReviewSession } from '../features/review/useReviewSession';
import { AnswerButtons } from '../features/review/AnswerButtons';
import { buttonsFor } from '../features/review/buttons';
import { CardHtml } from '../features/media/CardHtml';
import { SpeakerButton } from '../features/tts/SpeakerButton';
import { useSettings } from '../db/hooks';
import { tts } from '../features/tts/tts';
import { stripHtml } from '../lib/text';
import { cn } from '../lib/cn';

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
  const { deck, current, flipped, preview, counters, flip, rate } = session;

  const exitTo = deckId ? `/decks/${deckId}` : '/';

  // Keyboard: space/enter flip; 1..N rate after reveal; Esc exit.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        nav(exitTo);
        return;
      }
      if (!current) return;
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
      if (deck && n >= 1 && n <= deck.buttonCount) {
        e.preventDefault();
        const def = buttonsFor(deck.buttonCount)[n - 1];
        rate(def.rating);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, flipped, deck, flip, rate, nav, exitTo]);

  // Auto-pronounce the front when the answer is revealed.
  useEffect(() => {
    if (
      flipped &&
      current &&
      deck &&
      settings?.tts.enabled &&
      settings.tts.autoPronounceFront
    ) {
      const text = stripHtml(current.front);
      if (text) {
        void tts.speak(text, {
          lang: deck.ttsLang,
          voiceURI: settings.tts.voiceURI,
          rate: settings.tts.rate,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped, current?.id]);

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
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header
        className="flex items-center justify-between gap-3 px-4 md:px-6 h-14 border-b shrink-0"
        style={{ borderColor: 'var(--line)' }}
      >
        <button
          onClick={() => nav(exitTo)}
          className="mono text-xs text-muted hover:text-fg inline-flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft size={15} /> Sair
        </button>
        <div className="text-center min-w-0">
          <p className="font-bold truncate text-sm" style={{ maxWidth: '50vw' }}>
            {deck.name}
          </p>
          <p className="mono text-[10px] text-muted">
            Card {session.position} de {session.total}
          </p>
        </div>
        {counterChips}
      </header>

      {/* Card */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6">
        {!flipped && (
          <p className="mono text-[11px] text-muted mb-4 animate-pulse">
            Clique ou pressione espaço para revelar
          </p>
        )}
        {current && (
          <div className="flip-scene w-full max-w-2xl">
            <div
              onClick={flip}
              className={cn('flip-inner w-full cursor-pointer', flipped && 'is-flipped')}
              style={{ height: 'clamp(280px, 46vh, 440px)' }}
            >
              {/* Front face */}
              <div className="review-face flip-face">
                <div className="absolute top-3 right-3">
                  <SpeakerButton text={stripHtml(current.front)} lang={deck.ttsLang} size={18} onLight />
                </div>
                <CardHtml html={current.front} className="card-content" />
              </div>
              {/* Back face */}
              <div className="review-face flip-face flip-face-back">
                <div className="absolute top-3 right-3 flex gap-2">
                  <SpeakerButton text={stripHtml(current.back)} lang={deck.ttsLang} size={18} onLight />
                </div>
                <div className="w-full max-w-xl">
                  <CardHtml html={current.front} className="card-content-sm" />
                  <div className="my-4 h-px w-full" style={{ background: '#0f0f0f22' }} />
                  <CardHtml html={current.back} className="card-content" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom */}
      <div className="px-4 md:px-6 pb-6 pt-2 shrink-0 w-full max-w-2xl mx-auto">
        {!flipped ? (
          <button className="btn-mega w-full" onClick={flip}>
            <Zap size={18} /> Mostrar resposta
          </button>
        ) : (
          preview && (
            <AnswerButtons
              buttonCount={deck.buttonCount}
              preview={preview}
              onRate={rate}
            />
          )
        )}
      </div>
    </div>
  );
}
