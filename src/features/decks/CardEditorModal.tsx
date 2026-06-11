import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Cloud, Eye, Pencil, Volume2 } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { Toggle } from '../../components/Toggle';
import { RichTextField } from './RichTextField';
import type { RichTextFieldHandle } from './RichTextField';
import { GenerateCardAudioButton } from '../tts/GenerateCardAudioButton';
import { isTtsConfigured } from '../tts/googleProvider';
import { FlipCard } from '../review/FlipCard';
import { ClozeCard } from '../review/ClozeCard';
import { TypeInCard } from '../review/TypeInCard';
import { firstAudioUrl } from '../media/media';
import { getSignedUrl } from '../media/storage';
import { generatedAudioSide } from '../tts/cardAudio';
import { repo } from '../../db/repositories';
import { useSettings } from '../../db/hooks';
import { deckAudioEnabled } from '../../lib/deckAudio';
import { clozeKeepActive, clozeNumbers, isClozeHtml } from '../../lib/cloze';
import { cardTypeOf, markTypeIn, stripTypeInMark } from '../../lib/cardType';
import { pushToast } from '../../lib/toast';
import type { CardType } from '../../lib/cardType';
import type { Card } from '../../db/types';

interface CardEditorModalProps {
  open: boolean;
  onClose: () => void;
  deckId: string;
  /** When set, edits this card; otherwise creates a new one. */
  card?: Card | null;
}

function isEmptyHtml(html: string): boolean {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim().length === 0;
}

const TYPES: Array<{ id: CardType; label: string; hint: string }> = [
  { id: 'basic', label: 'Básico', hint: 'Frente e verso' },
  { id: 'cloze', label: 'Cloze', hint: 'Ocultar palavra' },
  { id: 'typein', label: 'Digitar', hint: 'Escreva a resposta' },
];

export function CardEditorModal({
  open,
  onClose,
  deckId,
  card,
}: CardEditorModalProps) {
  const editing = !!card;
  const reduce = useReducedMotion();
  const settings = useSettings();
  const [type, setType] = useState<CardType>('basic');
  const [front, setFront] = useState(''); // basic/cloze front, or type-in prompt (no marker)
  const [back, setBack] = useState(''); // basic/cloze extra, or type-in answer
  const [nonce, setNonce] = useState(0); // bumped to remount the fields
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [pronounce, setPronounce] = useState(true);
  // Preview mirrors the review card (flip + buttons, scaled down). Local reveal
  // state + each face's audio resolved for its speaker button.
  const [previewRevealed, setPreviewRevealed] = useState(false);
  const [previewFrontUrl, setPreviewFrontUrl] = useState<string | null>(null);
  const [previewBackUrl, setPreviewBackUrl] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  // Tab from the front jumps here; both also submit on Ctrl/Cmd+Enter.
  const backRef = useRef<RichTextFieldHandle>(null);
  const answerRef = useRef<HTMLInputElement>(null);
  const focusNext = () => (type === 'typein' ? answerRef.current?.focus() : backRef.current?.focus());

  useEffect(() => {
    if (open) {
      const t = card ? cardTypeOf(card.front) : 'basic';
      setType(t);
      setFront(card ? (t === 'typein' ? stripTypeInMark(card.front) : card.front) : '');
      setBack(card?.back ?? '');
      setNonce((n) => n + 1);
      setPreviewing(false);
      setPronounce(card ? settings?.mutedCards?.[card.id] !== true : true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, card]);

  // Side the generated audio (card.audioPath) speaks. Uses the same resolver as
  // review (explicit record, else inferred from the attached chips) so the
  // preview and review never disagree on which face owns the generated audio.
  const genAudioSide: 'front' | 'back' | null = card?.audioPath
    ? generatedAudioSide(card, settings ?? undefined)
    : null;
  // Each face has audio when the generated audio is for that side OR the side's
  // (edited) HTML carries an attached chip. Known synchronously so the buttons
  // appear instantly; the playable URL resolves in the effect below.
  const hasPreviewFront = genAudioSide === 'front' || front.includes('kioku-audio://');
  const hasPreviewBack = genAudioSide === 'back' || back.includes('kioku-audio://');

  // Entering the preview: start on the front and resolve each face's audio URL
  // (generated audio for that side wins over an attached chip on that side).
  useEffect(() => {
    if (!previewing) return;
    setPreviewRevealed(false);
    let cancelled = false;
    const resolve = async (side: 'front' | 'back'): Promise<string | null> => {
      if (card?.audioPath && genAudioSide === side) {
        try {
          return await getSignedUrl(card.audioPath);
        } catch {
          /* não conseguiu assinar: tenta o chip abaixo */
        }
      }
      const html = side === 'front' ? front : back;
      return html.includes('kioku-audio://') ? firstAudioUrl(html) : null;
    };
    void (async () => {
      const [f, b] = await Promise.all([resolve('front'), resolve('back')]);
      if (cancelled) return;
      setPreviewFrontUrl(f);
      setPreviewBackUrl(b);
    })();
    return () => {
      cancelled = true;
      const a = previewAudioRef.current;
      if (a) {
        try {
          a.pause();
        } catch {
          /* ignore */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewing]);

  const playPreview = (url: string | null) => {
    if (!url) return;
    const a = previewAudioRef.current;
    if (a) {
      try {
        a.pause();
      } catch {
        /* ignore */
      }
    }
    const next = new Audio(url);
    previewAudioRef.current = next;
    void next.play().catch(() => {});
  };

  function switchType(t: CardType) {
    if (t === type) return;
    setType(t);
    setNonce((n) => n + 1); // remount fields so contentEditable reseeds
  }

  /** Editing values -> what's actually stored (front carries the type marker). */
  function stored(): { f: string; b: string } {
    if (type === 'typein') return { f: markTypeIn(front), b: back };
    return { f: front, b: back };
  }

  /** Cards to CREATE from the current input. A cloze note with c1 + c2 yields one
   *  card per distinct cloze number (each blanking that word); a repeated number
   *  blanks both of those words in a single card. */
  function cardsToCreate(): Array<{ f: string; b: string }> {
    if (type === 'cloze') {
      const nums = clozeNumbers(front);
      if (nums.length === 0) return [{ f: front, b: back }];
      return nums.map((n) => ({ f: clozeKeepActive(front, n), b: back }));
    }
    if (type === 'typein') return [{ f: markTypeIn(front), b: back }];
    return [{ f: front, b: back }];
  }

  const canSave =
    !saving &&
    (type === 'cloze'
      ? isClozeHtml(front)
      : type === 'typein'
        ? !isEmptyHtml(front) && back.trim().length > 0
        : !isEmptyHtml(front));

  async function applyPronounce(cardId: string): Promise<void> {
    const muted = settings?.mutedCards ?? {};
    const isMuted = muted[cardId] === true;
    if (pronounce && isMuted) {
      const next = { ...muted };
      delete next[cardId];
      await repo.saveSettings({ mutedCards: next });
    } else if (!pronounce && !isMuted) {
      await repo.saveSettings({ mutedCards: { ...muted, [cardId]: true } });
    }
  }

  async function persist(): Promise<void> {
    const { f, b } = stored();
    if (editing && card) {
      await repo.updateCard(card.id, { front: f, back: b });
      await applyPronounce(card.id);
    } else {
      const created = await repo.createCard({ deckId, front: f, back: b });
      await applyPronounce(created.id);
    }
  }

  /** Add a new card but KEEP the modal open + cleared, so several cards can be
   *  added in a row. The user closes the modal themselves when done. */
  async function addAnother() {
    if (!canSave) return;
    setSaving(true);
    try {
      const cards = cardsToCreate();
      for (const { f, b } of cards) {
        const created = await repo.createCard({ deckId, front: f, back: b });
        await applyPronounce(created.id);
      }
      pushToast(
        'success',
        cards.length > 1 ? `${cards.length} cards adicionados.` : 'Card adicionado.',
      );
      setFront('');
      setBack('');
      setNonce((n) => n + 1);
      setPreviewing(false);
      setPronounce(true);
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (!canSave) return;
    // Creating: stay open so the user can keep adding cards. Editing: close.
    if (!editing) {
      await addAnother();
      return;
    }
    setSaving(true);
    try {
      await persist();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar card' : 'Novo card'}
      width={640}
      footer={
        <>
          <Button
            variant="default"
            className="mr-auto"
            icon={previewing ? <Pencil size={15} /> : <Eye size={15} />}
            onClick={() => setPreviewing((p) => !p)}
          >
            {previewing ? 'Voltar a editar' : 'Pré-visualizar'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {editing ? 'Cancelar' : 'Fechar'}
          </Button>
          <Button variant="accent" onClick={save} disabled={!canSave}>
            {editing ? 'Salvar' : 'Adicionar'}
          </Button>
        </>
      }
    >
      {/* Card-type selector */}
      <div className="mb-4">
        <span className="field-label">Tipo de carta</span>
        <div
          className="grid grid-cols-3 gap-1 p-1"
          style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-sm)' }}
          role="tablist"
        >
          {TYPES.map((t) => {
            const active = type === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchType(t.id)}
                className="relative py-1.5 px-2 rounded-[var(--r-sm)] text-center transition-colors"
                style={{ color: active ? '#fff' : 'var(--muted)' }}
              >
                {active && (
                  <motion.span
                    layoutId="cardtype-pill"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    style={{ position: 'absolute', inset: 0, background: 'var(--accent)', borderRadius: 'var(--r-sm)', zIndex: 0 }}
                  />
                )}
                <span style={{ position: 'relative', zIndex: 1 }}>
                  <span className="block text-sm font-semibold">{t.label}</span>
                  <span className="block text-[10px] opacity-80">{t.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {previewing ? (
          <motion.div
            key="preview"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="field-label">Pré-visualização (clique para virar)</p>
            <div className="flex justify-center">
              <div className="card-preview-scale w-full flex justify-center">
                {(() => {
                  const audioOn = deckAudioEnabled(settings ?? undefined, deckId);
                  const lang = 'en-US';
                  const h = 'clamp(190px, 26vh, 260px)';
                  const emptyFront = '<span style="opacity:.4">(frente vazia)</span>';
                  if (type === 'cloze') {
                    return (
                      <ClozeCard
                        front={front || emptyFront}
                        back={back}
                        ttsLang={lang}
                        revealed={previewRevealed}
                        onReveal={() => setPreviewRevealed((v) => !v)}
                        height={h}
                        audioEnabled={audioOn}
                      />
                    );
                  }
                  if (type === 'typein') {
                    return (
                      <TypeInCard
                        front={front || emptyFront}
                        back={back}
                        ttsLang={lang}
                        revealed={previewRevealed}
                        onReveal={() => setPreviewRevealed(true)}
                        onResolve={() => setPreviewRevealed(true)}
                        height={h}
                        audioEnabled={audioOn}
                      />
                    );
                  }
                  return (
                    <FlipCard
                      front={front || emptyFront}
                      back={back || '<span style="opacity:.4">(verso vazio)</span>'}
                      ttsLang={lang}
                      flipped={previewRevealed}
                      onFlip={() => setPreviewRevealed((v) => !v)}
                      height={h}
                      audioEnabled={audioOn}
                      hasFrontAudio={hasPreviewFront}
                      onReplayFrontAudio={() => playPreview(previewFrontUrl)}
                      hasBackAudio={hasPreviewBack}
                      onReplayBackAudio={() => playPreview(previewBackUrl)}
                    />
                  );
                })()}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key={`edit-${type}`}
            className="flex flex-col gap-4"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            {type === 'cloze' ? (
              <>
                <RichTextField
                  key={`cloze-${nonce}`}
                  label="Texto"
                  valueHtml={front}
                  onChange={setFront}
                  autoFocus
                  deckId={deckId}                  showCloze
                  onTab={focusNext}
                  onCtrlEnter={save}
                />
                <p className="text-xs text-muted -mt-2" style={{ lineHeight: 1.5 }}>
                  Selecione a palavra a ocultar e clique no botão{' '}
                  <span style={{ color: 'var(--accent)' }}>{'{ }'}</span> que acende na barra.
                </p>
                <RichTextField
                  ref={backRef}
                  key={`clozeextra-${nonce}`}
                  label="Extra (verso, opcional)"
                  valueHtml={back}
                  onChange={setBack}
                  deckId={deckId}                  onCtrlEnter={save}
                />
              </>
            ) : type === 'typein' ? (
              <>
                <RichTextField
                  key={`tiprompt-${nonce}`}
                  label="Frente (pergunta)"
                  valueHtml={front}
                  onChange={setFront}
                  autoFocus
                  deckId={deckId}                  onTab={focusNext}
                  onCtrlEnter={save}
                />
                <div>
                  <span className="field-label">Resposta (o usuário digita)</span>
                  <input
                    ref={answerRef}
                    className="field"
                    value={back.replace(/<[^>]*>/g, '')}
                    onChange={(e) => setBack(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                        e.preventDefault();
                        void save();
                      }
                    }}
                    placeholder="Resposta exata esperada"
                  />
                </div>
              </>
            ) : (
              <>
                <RichTextField
                  key={`front-${nonce}`}
                  label="Frente"
                  valueHtml={front}
                  onChange={setFront}
                  autoFocus
                  deckId={deckId}                  onTab={focusNext}
                  onCtrlEnter={save}
                />
                <RichTextField
                  ref={backRef}
                  key={`back-${nonce}`}
                  label="Verso"
                  valueHtml={back}
                  onChange={setBack}
                  deckId={deckId}                  onCtrlEnter={save}
                />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <label
        className="flex items-center gap-2.5 mt-5 pt-4 border-t cursor-pointer select-none"
        style={{ borderColor: 'var(--line)' }}
      >
        <Volume2 size={16} className="text-muted shrink-0" />
        <span className="text-sm flex-1 min-w-0">
          Pronunciar este card automaticamente
          <span className="block text-xs text-muted" style={{ lineHeight: 1.4 }}>
            Desligue para cards que não fazem sentido falar (ex.: não são de idiomas).
          </span>
        </span>
        <Toggle checked={pronounce} onChange={setPronounce} />
      </label>

      {isTtsConfigured() && (
        <div
          className="mt-5 p-3.5 rounded-[var(--r-md)]"
          style={{
            border: '1px solid var(--accent)',
            background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Cloud size={15} style={{ color: 'var(--accent)' }} className="shrink-0" />
            <span className="text-sm font-semibold">Adicionar Áudio</span>
          </div>
          {editing && card ? (
            <>
              {/* Pass the CURRENT edited front/back so generation reads the live
                  text, not the stale saved card (e.g. words added after opening). */}
              <GenerateCardAudioButton card={{ ...card, front: stored().f, back }} />
              <p className="text-[11px] text-muted mt-2" style={{ lineHeight: 1.45 }}>
                Gera um MP3 do texto e salva na sua conta. É tocado na revisão quando o áudio do
                deck está ligado. Escolha a voz em Configurações.
              </p>
            </>
          ) : (
            <p className="text-[11px] text-muted" style={{ lineHeight: 1.45 }}>
              Adicione o card primeiro; depois abra-o para gerar o áudio da frente ou do verso.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
