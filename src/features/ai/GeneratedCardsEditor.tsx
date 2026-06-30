import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Image as ImageIcon, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../components/Button';
import { uuid } from '../../lib/uuid';
import type { GeneratedCard } from './cards';
import type { CardType } from '../../lib/cardType';

const TYPE_LABEL: Record<CardType, string> = { basic: 'Básico', cloze: 'Cloze', typein: 'Digitar' };

interface GeneratedCardsEditorProps {
  cards: GeneratedCard[];
  onChange: (cards: GeneratedCard[]) => void;
  /** Receives the indices (into `cards`) picked for AI image generation, sorted.
   *  Empty when images are disabled. */
  onConfirm: (imageIndices: number[]) => void;
  busy?: boolean;
  confirmLabel?: string;
  /** Show the per-card "gerar imagem" checkbox + select-all + cap note. */
  imagesEnabled?: boolean;
  /** Remaining images in the user's PLAN quota (limit - used), for the count/cap
   *  message. Ignored when `imagesUnlimited`. */
  imagesRemaining?: number;
  /** The plan grants unlimited images — show "ilimitadas" instead of a number. */
  imagesUnlimited?: boolean;
  atImageCap?: boolean;
  /** Plano não cobre imagens (limite 0, ex.: gratuito) — mostra CTA de upgrade. */
  imagesNotCovered?: boolean;
  /** Abre o popup de planos (fade-in) ao clicar em "ATUALIZAR PLANO". */
  onUpgrade?: () => void;
  /** Bump to clear the image selection (e.g. after the cards are regenerated). */
  resetKey?: number;
  /** Seed the per-card image selection once on mount (for draft restore). */
  initialImageSelection?: number[];
  /** Report the current image selection (sorted indices) whenever it changes, so
   *  the parent can persist it as part of a draft. */
  onImageSelectionChange?: (indices: number[]) => void;
}

/**
 * Shared editable preview for AI-generated cards. Lets the user edit each
 * front/back, remove cards, add a blank one, optionally pick which cards get an
 * AI image, then confirm to create the deck.
 */
export function GeneratedCardsEditor({
  cards,
  onChange,
  onConfirm,
  busy = false,
  confirmLabel = 'Criar deck',
  imagesEnabled = false,
  imagesRemaining = 0,
  imagesUnlimited = false,
  atImageCap = false,
  imagesNotCovered = false,
  onUpgrade,
  resetKey = 0,
  initialImageSelection,
  onImageSelectionChange,
}: GeneratedCardsEditorProps) {
  // Seeded from a restored draft (if any) on first mount, then internal.
  const [imageSel, setImageSel] = useState<Set<number>>(() => new Set(initialImageSelection ?? []));
  // A STABLE React key per card so AnimatePresence can animate the exact card
  // being deleted (index keys would shift and animate the wrong/last one). Kept
  // in lockstep with `cards` by the add/remove handlers; rebuilt on regeneration.
  const [ids, setIds] = useState<string[]>(() => cards.map(() => uuid()));

  // Report the selection up (sorted) so the parent can persist it in its draft.
  const onSelChangeRef = useRef(onImageSelectionChange);
  onSelChangeRef.current = onImageSelectionChange;
  useEffect(() => {
    onSelChangeRef.current?.([...imageSel].sort((a, b) => a - b));
  }, [imageSel]);

  // Regenerating replaces all cards, so the old index-based selection AND keys are
  // stale: clear the selection and assign fresh keys. Skips the initial mount so a
  // restored draft's selection (and the matching useState-seeded keys) survive.
  const firstResetRef = useRef(true);
  useEffect(() => {
    if (firstResetRef.current) {
      firstResetRef.current = false;
      return;
    }
    setImageSel(new Set());
    setIds(cards.map(() => uuid()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Safety net: if `cards` length ever changes outside add/remove, re-sync keys.
  useEffect(() => {
    setIds((prev) => (prev.length === cards.length ? prev : cards.map(() => uuid())));
  }, [cards.length]);

  const update = (i: number, patch: Partial<GeneratedCard>) =>
    onChange(cards.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const remove = (i: number) => {
    onChange(cards.filter((_, idx) => idx !== i));
    // Keep the OTHER cards' keys stable (filter, don't regenerate) so only the
    // removed card animates out.
    setIds((prev) => prev.filter((_, idx) => idx !== i));
    // Drop i and shift higher indices down so the selection still lines up.
    setImageSel((prev) => {
      const next = new Set<number>();
      for (const idx of prev) {
        if (idx === i) continue;
        next.add(idx > i ? idx - 1 : idx);
      }
      return next;
    });
  };
  const add = () => {
    onChange([...cards, { type: 'basic', front: '', back: '' }]);
    setIds((prev) => [...prev, uuid()]);
  };

  const toggleImage = (i: number) =>
    setImageSel((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  const allSelected = cards.length > 0 && imageSel.size === cards.length;
  const toggleAll = () => setImageSel(allSelected ? new Set() : new Set(cards.map((_, i) => i)));

  const selCount = imageSel.size;
  const willGenerate = imagesUnlimited ? selCount : Math.min(selCount, imagesRemaining);

  return (
    <div className="flex flex-col gap-3 lg:flex-1 lg:min-h-0">
      <div className="flex items-center justify-between">
        <p className="mono text-sm text-muted">
          {cards.length} {cards.length === 1 ? 'card' : 'cards'}
        </p>
        <button
          type="button"
          onClick={add}
          className="text-sm text-accent hover:underline inline-flex items-center gap-1"
        >
          <Plus size={14} /> Adicionar card
        </button>
      </div>

      {imagesEnabled && (
        <div
          className="flex flex-col gap-1 p-2.5 rounded-[var(--r-sm)]"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
              <ImageIcon size={14} style={{ color: 'var(--accent)' }} /> Imagens com IA
            </span>
            <button
              type="button"
              onClick={toggleAll}
              disabled={atImageCap || cards.length === 0}
              className="text-xs text-accent hover:underline disabled:opacity-40 disabled:no-underline"
            >
              {allSelected ? 'Limpar seleção' : 'Selecionar todos'}
            </button>
          </div>
          <p className="text-[11px] text-muted" style={{ lineHeight: 1.45 }}>
            {imagesNotCovered ? (
              <span style={{ color: 'var(--accent)' }}>
                seu plano não cobre imagens.{' '}
                <button
                  type="button"
                  onClick={onUpgrade}
                  className="font-bold hover:underline"
                  style={{ color: 'var(--accent)' }}
                >
                  ATUALIZAR PLANO
                </button>
              </span>
            ) : atImageCap ? (
              <span style={{ color: 'var(--accent)' }}>
                Limite de imagens do seu plano atingido.
              </span>
            ) : imagesUnlimited ? (
              selCount === 0 ? (
                <>Marque os cards que receberão uma ilustração. Imagens ilimitadas no seu plano.</>
              ) : (
                <>
                  {selCount} {selCount === 1 ? 'imagem será gerada' : 'imagens serão geradas'}.
                </>
              )
            ) : selCount === 0 ? (
              <>
                Marque os cards que receberão uma ilustração. Restam {imagesRemaining} imagens no seu
                limite.
              </>
            ) : willGenerate < selCount ? (
              <>
                {selCount} selecionados · serão geradas {willGenerate} (limite: {imagesRemaining}{' '}
                restantes).
              </>
            ) : (
              <>
                {selCount} {selCount === 1 ? 'imagem será gerada' : 'imagens serão geradas'} · usa do
                seu limite ({imagesRemaining} restantes).
              </>
            )}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2 overflow-y-auto pr-1 max-h-[55vh] lg:max-h-none lg:flex-1 lg:min-h-0">
        <AnimatePresence mode="popLayout" initial={false}>
        {cards.map((c, i) => (
          <motion.div
            key={ids[i] ?? `card-${i}`}
            layout="position"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="surface p-3 flex gap-2 items-start"
          >
            <div className="flex flex-col items-center gap-1 pt-2 shrink-0">
              <span className="mono text-[10px] text-muted">{i + 1}</span>
              <span
                className="mono text-[9px] px-1.5 py-0.5 rounded-full whitespace-nowrap"
                style={{ color: 'var(--muted)', border: '1px solid var(--line)' }}
              >
                {TYPE_LABEL[c.type]}
              </span>
              {imagesEnabled && (
                <button
                  type="button"
                  onClick={() => toggleImage(i)}
                  disabled={atImageCap && !imageSel.has(i)}
                  aria-pressed={imageSel.has(i)}
                  title="Gerar imagem para este card"
                  className="mt-0.5 flex items-center justify-center shrink-0 transition-colors disabled:opacity-40"
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 5,
                    background: imageSel.has(i) ? 'var(--accent)' : 'transparent',
                    border: `1px solid ${imageSel.has(i) ? 'var(--accent)' : 'var(--line-strong)'}`,
                  }}
                >
                  <ImageIcon size={12} color={imageSel.has(i) ? '#fff' : 'var(--muted)'} />
                </button>
              )}
            </div>
            <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-2 gap-2">
              <textarea
                className="field"
                rows={3}
                style={{ fontSize: 11, lineHeight: 1.4 }}
                value={c.front}
                placeholder="Frente"
                aria-label={`Frente do card ${i + 1}`}
                onChange={(e) => update(i, { front: e.target.value })}
              />
              <textarea
                className="field"
                rows={3}
                style={{ fontSize: 11, lineHeight: 1.4 }}
                value={c.back}
                placeholder="Verso"
                aria-label={`Verso do card ${i + 1}`}
                onChange={(e) => update(i, { back: e.target.value })}
              />
            </div>
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remover card ${i + 1}`}
              className="p-1.5 text-muted hover:text-accent transition-colors shrink-0"
            >
              <Trash2 size={15} />
            </button>
          </motion.div>
        ))}
        </AnimatePresence>
      </div>

      <div>
        <Button
          variant="accent"
          className="w-full justify-center"
          onClick={() => onConfirm(imagesEnabled ? [...imageSel].sort((a, b) => a - b) : [])}
          disabled={busy || cards.length === 0}
        >
          {busy ? 'Criando...' : `${confirmLabel} (${cards.length})`}
        </Button>
      </div>
    </div>
  );
}
