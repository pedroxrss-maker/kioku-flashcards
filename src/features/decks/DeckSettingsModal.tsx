import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { Toggle } from '../../components/Toggle';
import { cn } from '../../lib/cn';
import { repo } from '../../db/repositories';
import { useSettings } from '../../db/hooks';
import { DECK_COLORS } from '../../db/factories';
import { DeckIconPicker, defaultIconFor } from './deckIcons';
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
  }, [open, deck]);

  useEffect(() => {
    if (open) setIcon(settings?.deckIcons?.[deck.id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deck.id]);

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
    onClose();
  }

  async function remove() {
    await repo.deleteDeck(deck.id);
    onClose();
    nav('/decks');
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Configurações do deck"
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="accent" onClick={save} disabled={!name.trim()}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
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
                className={cn('h-8 w-8 rounded-[var(--r-sm)] transition-transform', color === c ? 'scale-110' : 'opacity-70 hover:opacity-100')}
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
                  'rounded-[var(--r-sm)] border px-3 py-2 text-left transition-colors',
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
              <div className="field flex items-center font-semibold" style={{ color: 'var(--accent)' }}>Infinitas</div>
            ) : (
              <input id="ds-rev" type="number" min={0} className="field" value={reviewsPerDay}
                onChange={(e) => setReviewsPerDay(Math.max(0, Number(e.target.value) || 0))} />
            )}
            <div className="flex items-center gap-2 mt-2">
              <Toggle checked={reviewsPerDay >= UNLIMITED_PER_DAY}
                onChange={(v) => setReviewsPerDay(v ? UNLIMITED_PER_DAY : 200)} />
              <span className="text-xs">Infinitas</span>
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

        <div className="pt-2 border-t" style={{ borderColor: 'var(--line)' }}>
          {confirmDelete ? (
            <div className="flex items-center justify-between gap-3">
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
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-2 text-sm text-muted hover:text-accent transition-colors"
            >
              <Trash2 size={15} /> Excluir deck
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
