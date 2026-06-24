import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, RotateCcw, Trash2, VolumeX } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Button } from '../../components/Button';
import { Toggle } from '../../components/Toggle';
import { cn } from '../../lib/cn';
import { useDraft } from '../../lib/useDraft';
import { repo } from '../../db/repositories';
import { useSettings } from '../../db/hooks';
import { DECK_COLORS } from '../../db/factories';
import { stripAudioHtml } from '../media/media';
import { DeckIconPicker, defaultIconFor } from './deckIcons';
import { deckPathOf, memberDeckIdsForPath } from '../../lib/deckTree';
import { pushToast } from '../../lib/toast';
import { UNLIMITED_PER_DAY } from '../../db/types';
import type { Algorithm, Deck } from '../../db/types';

interface DeckSettingsModalProps {
  open: boolean;
  onClose: () => void;
  deck: Deck;
}

const TTS_LANGS = [
  ['en-US', 'Inglês (EUA)'],
  ['en-GB', 'Inglês (Reino Unido)'],
  ['pt-BR', 'Português (Brasil)'],
  ['es-ES', 'Espanhol'],
  ['fr-FR', 'Francês'],
  ['de-DE', 'Alemão'],
  ['it-IT', 'Italiano'],
  ['ja-JP', 'Japonês'],
] as const;

export function DeckSettingsModal({ open, onClose, deck }: DeckSettingsModalProps) {
  const nav = useNavigate();
  const settings = useSettings();
  const [icon, setIcon] = useState<string | undefined>(undefined);
  const [name, setName] = useState(deck.name);
  const [category, setCategory] = useState(deck.category ?? '');
  const [color, setColor] = useState(deck.color);
  const [algorithm, setAlgorithm] = useState<Algorithm>(deck.algorithm);
  const [newPerDay, setNewPerDay] = useState(deck.newPerDay);
  const [reviewsPerDay, setReviewsPerDay] = useState(deck.reviewsPerDay);
  const [retention, setRetention] = useState(deck.desiredRetention);
  const [ttsLang, setTtsLang] = useState(deck.ttsLang);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [stripping, setStripping] = useState(false);
  const [confirmStrip, setConfirmStrip] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const audioOn = settings?.deckAudio?.[deck.id] !== false;
  // Whether the form differs from the deck's saved values (drives the "Descartar"
  // action and mirrors the draft's hasContent).
  const changed =
    name !== deck.name ||
    (category ?? '') !== (deck.category ?? '') ||
    color !== deck.color ||
    icon !== settings?.deckIcons?.[deck.id] ||
    algorithm !== deck.algorithm ||
    newPerDay !== deck.newPerDay ||
    reviewsPerDay !== deck.reviewsPerDay ||
    retention !== deck.desiredRetention ||
    ttsLang !== deck.ttsLang;

  // Reset from the deck on OPEN / deck switch only — not on every `deck` object
  // update, which would clobber a draft the useDraft hook restores.
  useEffect(() => {
    if (open) {
      setName(deck.name);
      setCategory(deck.category ?? '');
      setColor(deck.color);
      setAlgorithm(deck.algorithm);
      setNewPerDay(deck.newPerDay);
      setReviewsPerDay(deck.reviewsPerDay);
      setRetention(deck.desiredRetention);
      setTtsLang(deck.ttsLang);
      setConfirmDelete(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deck.id]);

  useEffect(() => {
    if (open) setIcon(settings?.deckIcons?.[deck.id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deck.id]);

  // Persist the in-progress edits per deck, so leaving and returning restores
  // them. `hasContent` = the form DIFFERS from the deck's saved values, so an
  // untouched form never creates a draft.
  const draft = useDraft({
    key: `draft:edit-deck:${deck.id}`,
    active: open,
    value: { name, category, color, icon, algorithm, newPerDay, reviewsPerDay, retention, ttsLang },
    hasContent: (v) =>
      v.name !== deck.name ||
      (v.category ?? '') !== (deck.category ?? '') ||
      v.color !== deck.color ||
      v.icon !== settings?.deckIcons?.[deck.id] ||
      v.algorithm !== deck.algorithm ||
      v.newPerDay !== deck.newPerDay ||
      v.reviewsPerDay !== deck.reviewsPerDay ||
      v.retention !== deck.desiredRetention ||
      v.ttsLang !== deck.ttsLang,
    onRestore: (v) => {
      setName(v.name ?? deck.name);
      setCategory(v.category ?? '');
      if (v.color) setColor(v.color);
      setIcon(v.icon);
      if (v.algorithm) setAlgorithm(v.algorithm);
      if (typeof v.newPerDay === 'number') setNewPerDay(v.newPerDay);
      if (typeof v.reviewsPerDay === 'number') setReviewsPerDay(v.reviewsPerDay);
      if (typeof v.retention === 'number') setRetention(v.retention);
      setTtsLang(v.ttsLang);
    },
  });

  function discardDraft() {
    draft.clear();
    setName(deck.name);
    setCategory(deck.category ?? '');
    setColor(deck.color);
    setAlgorithm(deck.algorithm);
    setNewPerDay(deck.newPerDay);
    setReviewsPerDay(deck.reviewsPerDay);
    setRetention(deck.desiredRetention);
    setTtsLang(deck.ttsLang);
    setIcon(settings?.deckIcons?.[deck.id]);
  }

  async function save() {
    if (!name.trim()) return;
    await repo.updateDeck(deck.id, {
      name: name.trim(),
      category: category.trim() || undefined,
      color,
      algorithm,
      newPerDay,
      reviewsPerDay,
      desiredRetention: retention,
      buttonCount: 4,
      ttsLang,
    });
    await repo.saveSettings({
      deckIcons: { ...(settings?.deckIcons ?? {}), [deck.id]: icon ?? defaultIconFor(deck.id) },
    });
    draft.clear(); // saved — drop the in-progress draft
    onClose();
  }

  async function remove() {
    await repo.deleteDeck(deck.id);
    onClose();
    nav('/decks');
  }

  async function doReset() {
    if (resetting) return;
    setResetting(true);
    try {
      await repo.resetDeck(deck.id);
      pushToast('success', 'Deck reiniciado. Todos os cards voltaram a ser novos.');
      setResetOpen(false);
    } finally {
      setResetting(false);
    }
  }

  /** Toggle pronunciation/audio for this deck — and, when it's a parent, for all
   *  of its subdecks too, so silencing a parent really mutes the whole subtree
   *  (a parent review pronounces each card with its own subdeck's setting). */
  async function setAudio(enabled: boolean) {
    const allDecks = await repo.listDecks();
    const path = deckPathOf(deck, settings?.deckPaths);
    const memberIds = new Set(memberDeckIdsForPath(path, allDecks, settings?.deckPaths));
    memberIds.add(deck.id);
    const deckAudio = { ...(settings?.deckAudio ?? {}) };
    for (const id of memberIds) deckAudio[id] = enabled;
    void repo.saveSettings({ deckAudio });
  }

  /** Permanently strip attached-audio tokens from every card in this deck — and,
   *  when it's a parent, from every card in its subdecks too (so "todos os
   *  áudios deste deck" really clears the whole subtree). */
  async function stripAllAudio() {
    if (stripping) return;
    setStripping(true);
    try {
      const allDecks = await repo.listDecks();
      const path = deckPathOf(deck, settings?.deckPaths);
      const memberIds = new Set(memberDeckIdsForPath(path, allDecks, settings?.deckPaths));
      memberIds.add(deck.id); // always include the deck itself
      let cleaned = 0;
      for (const did of memberIds) {
        const cards = await repo.listCards(did);
        for (const card of cards) {
          const front = stripAudioHtml(card.front);
          const back = stripAudioHtml(card.back);
          if (front !== card.front || back !== card.back) {
            await repo.updateCard(card.id, { front, back });
            cleaned += 1;
          }
        }
      }
      pushToast(
        cleaned > 0 ? 'success' : 'info',
        cleaned > 0
          ? `Áudio removido de ${cleaned} ${cleaned === 1 ? 'card' : 'cards'}.`
          : 'Nenhum áudio anexado encontrado neste deck.',
      );
    } finally {
      setStripping(false);
    }
  }

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      title="Configurações do deck"
      width={560}
      persistent
      onSubmit={() => void save()}
      footer={
        <>
          {/* Edits persist as a draft, so leaving is non-destructive — "Voltar". */}
          <Button variant="ghost" className="hover-bounce" icon={<ArrowLeft size={15} />} onClick={onClose}>
            Voltar
          </Button>
          <Button variant="accent" className="hover-bounce" onClick={save} disabled={!name.trim()}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {changed && (
          <div className="flex items-center justify-between gap-3 -mb-1">
            <span className="text-xs text-muted">Alterações não salvas (guardadas como rascunho).</span>
            <button
              type="button"
              onClick={discardDraft}
              className="text-xs text-muted hover:text-accent transition-colors shrink-0"
            >
              Descartar
            </button>
          </div>
        )}
        <div>
          <label className="field-label" htmlFor="ds-name">Nome</label>
          <input id="ds-name" className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label" htmlFor="ds-cat">Categoria</label>
            <input id="ds-cat" className="field" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor="ds-lang">Idioma (voz)</label>
            <select id="ds-lang" className="field" value={ttsLang} onChange={(e) => setTtsLang(e.target.value)}>
              {TTS_LANGS.map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <span className="field-label">Cor</span>
          <div className="flex flex-wrap gap-2">
            {DECK_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Cor ${c}`}
                onClick={() => setColor(c)}
                className={cn('hover-bounce h-8 w-8 rounded-[var(--r-sm)] transition-transform', color === c ? 'scale-110' : 'opacity-70 hover:opacity-100')}
                style={{ background: c, outline: color === c ? '2px solid var(--fg)' : 'none', outlineOffset: 2 }}
              />
            ))}
          </div>
        </div>

        <div>
          <span className="field-label">Logo</span>
          <DeckIconPicker color={color} value={icon} onChange={setIcon} />
        </div>

        <div>
          <span className="field-label">Algoritmo</span>
          <div className="grid grid-cols-2 gap-2">
            {(['fsrs', 'sm2'] as Algorithm[]).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAlgorithm(a)}
                className={cn(
                  'hover-bounce rounded-[var(--r-sm)] border px-3 py-2 text-left transition-colors',
                  algorithm === a
                    ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)]'
                    : 'border-[color:var(--line-strong)] bg-[color:var(--surface-2)] hover:border-[color:var(--fg)]',
                )}
              >
                <span className="mono text-xs block">{a === 'fsrs' ? 'FSRS' : 'SM-2'}</span>
                <span className="text-[11px] text-muted">{a === 'fsrs' ? 'Moderno' : 'Clássico'}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label" htmlFor="ds-new">Cards novos / dia</label>
            <input id="ds-new" type="number" min={0} className="field" value={newPerDay}
              onChange={(e) => setNewPerDay(Math.max(0, Number(e.target.value) || 0))} />
          </div>
          <div>
            <label className="field-label" htmlFor="ds-rev">Revisões / dia</label>
            {reviewsPerDay >= UNLIMITED_PER_DAY ? (
              <div className="field flex items-center font-semibold" style={{ color: 'var(--accent)' }}>Automáticas</div>
            ) : (
              <input id="ds-rev" type="number" min={0} className="field" value={reviewsPerDay}
                onChange={(e) => setReviewsPerDay(Math.max(0, Number(e.target.value) || 0))} />
            )}
            <div className="flex items-center gap-2 mt-2">
              <Toggle checked={reviewsPerDay >= UNLIMITED_PER_DAY}
                onChange={(v) => setReviewsPerDay(v ? UNLIMITED_PER_DAY : 200)} />
              <span className="text-xs">Automáticas</span>
            </div>
          </div>
        </div>

        {algorithm === 'fsrs' && (
          <div>
            <label className="field-label" htmlFor="ds-ret">
              Retenção desejada · {Math.round(retention * 100)}%
            </label>
            <input
              id="ds-ret"
              type="range"
              min={0.8}
              max={0.97}
              step={0.01}
              value={retention}
              onChange={(e) => setRetention(Number(e.target.value))}
              className="w-full accent-[color:var(--accent)]"
            />
          </div>
        )}

        <div className="pt-3 border-t" style={{ borderColor: 'var(--line)' }}>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Pronúncia e áudio</p>
              <p className="text-xs text-muted mt-0.5" style={{ lineHeight: 1.5 }}>
                Liga/desliga a <b>pronúncia automática por voz (TTS)</b> e os áudios anexados
                deste deck{' '}(e dos subdecks). Desligue aqui para silenciar a voz. Vem desligado
                em decks novos e importados.
              </p>
            </div>
            <Toggle checked={audioOn} onChange={setAudio} />
          </div>
          <button
            type="button"
            onClick={() => setConfirmStrip(true)}
            disabled={stripping}
            className="hover-bounce flex items-center gap-2 text-sm text-muted hover:text-accent transition-colors mt-3 disabled:opacity-50"
            title="Apaga arquivos de áudio anexados aos cards. Não afeta a voz (TTS) — para isso use o botão acima."
          >
            <VolumeX size={15} />
            {stripping ? 'Removendo…' : 'Remover áudios anexados (arquivos)'}
          </button>
        </div>

        <div className="pt-3 border-t" style={{ borderColor: 'var(--line)' }}>
          <button
            type="button"
            onClick={() => setResetOpen(true)}
            className="hover-bounce flex items-center gap-2 text-sm text-muted hover:text-fg transition-colors"
          >
            <RotateCcw size={15} /> Reiniciar deck
          </button>
        </div>

        <div className="pt-3 border-t" style={{ borderColor: 'var(--line)' }}>
          <AnimatePresence mode="wait" initial={false}>
            {confirmDelete ? (
              <motion.div
                key="confirm-delete"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center justify-between gap-3"
              >
                <span className="text-sm text-muted">Excluir o deck e todos os cards?</span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                    Não
                  </Button>
                  <button
                    type="button"
                    onClick={remove}
                    className="btn btn-sm"
                    style={{ borderColor: 'var(--accent)', background: 'var(--accent)', color: 'var(--fg)' }}
                  >
                    Sim, excluir
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.button
                key="trigger-delete"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="hover-bounce flex items-center gap-2 text-sm text-muted hover:text-accent transition-colors"
              >
                <Trash2 size={15} /> Excluir deck
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Modal>

      {/* Reset confirmation — smaller warning dialog. */}
      <Modal
        open={resetOpen}
        onClose={() => !resetting && setResetOpen(false)}
        title="Reiniciar deck?"
        width={420}
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetOpen(false)} disabled={resetting}>
              Cancelar
            </Button>
            <button
              type="button"
              onClick={doReset}
              disabled={resetting}
              className="btn disabled:opacity-50"
              style={{ borderColor: 'var(--accent)', background: 'var(--accent)', color: '#fff' }}
            >
              {resetting ? 'Reiniciando…' : 'Sim, reiniciar'}
            </button>
          </>
        }
      >
        <p className="text-sm text-muted" style={{ lineHeight: 1.6 }}>
          Isto vai <b className="text-fg">zerar todo o agendamento</b> de{' '}
          <b className="text-fg">{deck.name}</b>:
        </p>
        <ul className="text-sm text-muted mt-2 space-y-1 list-disc pl-5" style={{ lineHeight: 1.6 }}>
          <li>todos os cards voltam a ser <b className="text-fg">novos</b>;</li>
          <li>os intervalos, facilidade e memória (SM-2/FSRS) são apagados;</li>
          <li>o histórico de revisões deste deck é removido.</li>
        </ul>
        <p className="text-sm mt-3" style={{ color: 'var(--accent)' }}>
          Esta ação não pode ser desfeita. O conteúdo dos cards (frente/verso) é mantido.
        </p>
      </Modal>

      <ConfirmDialog
        open={confirmStrip}
        onClose={() => setConfirmStrip(false)}
        onConfirm={() => void stripAllAudio()}
        title="Remover áudios anexados"
        message="Isto vai remover o áudio anexado de todos os cards deste deck (e dos subdecks). Esta ação não pode ser desfeita. Continuar?"
        confirmLabel="Remover"
      />
    </>
  );
}
