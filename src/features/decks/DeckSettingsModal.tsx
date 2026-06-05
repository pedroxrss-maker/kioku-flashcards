import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { cn } from '../../lib/cn';
import { repo } from '../../db/repositories';
import { DECK_COLORS } from '../../db/factories';
import type { Algorithm, ButtonCount, Deck } from '../../db/types';

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
  const [name, setName] = useState(deck.name);
  const [category, setCategory] = useState(deck.category ?? '');
  const [color, setColor] = useState(deck.color);
  const [algorithm, setAlgorithm] = useState<Algorithm>(deck.algorithm);
  const [newPerDay, setNewPerDay] = useState(deck.newPerDay);
  const [reviewsPerDay, setReviewsPerDay] = useState(deck.reviewsPerDay);
  const [retention, setRetention] = useState(deck.desiredRetention);
  const [buttonCount, setButtonCount] = useState<ButtonCount>(deck.buttonCount);
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
      setButtonCount(deck.buttonCount);
      setTtsLang(deck.ttsLang);
      setConfirmDelete(false);
    }
  }, [open, deck]);

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
      buttonCount,
      ttsLang,
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
                className={cn('h-8 w-8 transition-transform', color === c ? 'scale-110' : 'opacity-70 hover:opacity-100')}
                style={{ background: c, outline: color === c ? '2px solid var(--fg)' : 'none', outlineOffset: 2 }}
              />
            ))}
          </div>
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
                  'border-2 px-3 py-2 text-left transition-colors',
                  algorithm === a
                    ? 'border-[color:var(--accent)] bg-[color:var(--surface)]'
                    : 'border-[color:var(--line)] hover:border-[color:var(--fg)]',
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
            <input id="ds-rev" type="number" min={0} className="field" value={reviewsPerDay}
              onChange={(e) => setReviewsPerDay(Math.max(0, Number(e.target.value) || 0))} />
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

        <div>
          <span className="field-label">Botões de resposta (King of Buttons)</span>
          <div className="grid grid-cols-3 gap-2">
            {([2, 3, 4] as ButtonCount[]).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setButtonCount(n)}
                className={cn(
                  'border-2 px-3 py-2 transition-colors mono text-xs',
                  buttonCount === n
                    ? 'border-[color:var(--accent)] bg-[color:var(--surface)]'
                    : 'border-[color:var(--line)] hover:border-[color:var(--fg)]',
                )}
              >
                {n} botões
              </button>
            ))}
          </div>
        </div>

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
