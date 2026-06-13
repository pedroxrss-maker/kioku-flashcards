import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { cn } from '../../lib/cn';
import { pushToast } from '../../lib/toast';
import { scheduleAchievementCheck } from '../gamification/achievements';
import { repo } from '../../db/repositories';
import { useSettings } from '../../db/hooks';
import { DECK_COLORS } from '../../db/factories';
import { DeckIconPicker } from './deckIcons';
import type { Algorithm } from '../../db/types';

interface CreateDeckModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreateDeckModal({ open, onClose }: CreateDeckModalProps) {
  const settings = useSettings();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [color, setColor] = useState<string>(DECK_COLORS[0]);
  const [algorithm, setAlgorithm] = useState<Algorithm>('sm2');
  const [retention, setRetention] = useState(0.9);
  const [icon, setIcon] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setCategory('');
      setColor(DECK_COLORS[0]);
      setIcon(undefined);
      setAlgorithm(settings?.defaultAlgorithm ?? 'sm2');
      setRetention(settings?.defaultDesiredRetention ?? 0.9);
    }
  }, [open, settings]);

  async function submit() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const deck = await repo.createDeck({
        name,
        category: category.trim() || undefined,
        color,
        algorithm,
        newPerDay: settings?.newPerDay,
        reviewsPerDay: settings?.reviewsPerDay,
        // FSRS uses the slider value; SM-2 ignores retention (keep a sane default).
        desiredRetention:
          algorithm === 'fsrs' ? retention : settings?.defaultDesiredRetention ?? 0.9,
        buttonCount: 4,
      });
      // New decks start with audio OFF (no speaker / pronunciation until the
      // user enables it in deck settings).
      await repo.saveSettings({
        deckAudio: { ...(settings?.deckAudio ?? {}), [deck.id]: false },
        ...(icon ? { deckIcons: { ...(settings?.deckIcons ?? {}), [deck.id]: icon } } : {}),
      });
      scheduleAchievementCheck(); // decks_1 / decks_5
      onClose();
      nav(`/decks/${deck.id}`);
    } catch (err) {
      // Don't fail silently (the button used to just re-enable on iPad Safari).
      pushToast('error', 'Não foi possível criar o deck. Tente novamente.');
      // eslint-disable-next-line no-console
      console.error('createDeck failed', err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo deck"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="accent" onClick={submit} disabled={!name.trim() || saving}>
            Criar deck
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className="field-label" htmlFor="deck-name">
            Nome
          </label>
          <input
            id="deck-name"
            className="field"
            value={name}
            autoFocus
            placeholder="Ex.: Inglês — Phrasal Verbs"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
        </div>

        <div>
          <label className="field-label" htmlFor="deck-cat">
            Categoria (opcional)
          </label>
          <input
            id="deck-cat"
            className="field"
            value={category}
            placeholder="Ex.: Idiomas"
            onChange={(e) => setCategory(e.target.value)}
          />
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
                className={cn(
                  'h-8 w-8 rounded-[var(--r-sm)] transition-transform',
                  color === c ? 'scale-110' : 'opacity-70 hover:opacity-100',
                )}
                style={{
                  background: c,
                  outline: color === c ? '2px solid var(--fg)' : 'none',
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>
        </div>

        <div>
          <span className="field-label">Logo</span>
          <DeckIconPicker color={color} value={icon} onChange={setIcon} />
          <p className="text-[11px] text-muted mt-2">
            Escolha um ícone ou anexe uma imagem do seu computador (fica sempre com cantos arredondados).
          </p>
        </div>

        <div>
          <span className="field-label">Algoritmo</span>
          <div className="grid grid-cols-2 gap-2">
            {(['fsrs', 'sm2'] as Algorithm[]).map((a) => {
              const selected = algorithm === a;
              return (
                <button
                  key={a}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setAlgorithm(a)}
                  className="hover-lift px-3 py-2.5 text-left transition-colors"
                  style={{
                    borderRadius: 'var(--r-sm)',
                    border: selected
                      ? '2px solid var(--accent)'
                      : '1px solid var(--line-strong)',
                    background: selected
                      ? 'var(--accent-soft)'
                      : 'var(--surface-2)',
                  }}
                >
                  <span className="mono text-xs block">
                    {a === 'fsrs' ? 'FSRS' : 'SM-2'}
                  </span>
                  <span className="text-[11px] text-muted">
                    {a === 'fsrs' ? 'Moderno e eficiente' : 'Clássico (Anki)'}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="text-[11px] text-muted mt-2" style={{ lineHeight: 1.5 }}>
            {algorithm === 'fsrs'
              ? 'FSRS aprende com o seu histórico para prever quando você esqueceria e agenda a revisão nesse momento — menos repetições para a mesma retenção.'
              : 'SM-2 é o algoritmo clássico do Anki: a cada acerto multiplica o intervalo por um fator de facilidade. Simples, previsível e testado por décadas.'}
          </p>

          {algorithm === 'fsrs' && (
            <div
              className="mt-3 rise"
              style={{ border: '1px solid var(--line-strong)', borderRadius: 'var(--r-md)', background: 'var(--surface-2)', padding: '14px' }}
            >
              <p className="field-label" style={{ marginBottom: 12 }}>
                Configurações FSRS
              </p>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm" htmlFor="deck-retention">
                  Retenção desejada
                </label>
                <span className="mono text-xs" style={{ color: 'var(--accent)' }}>
                  {Math.round(retention * 100)}%
                </span>
              </div>
              <input
                id="deck-retention"
                type="range"
                min={0.8}
                max={0.97}
                step={0.01}
                value={retention}
                onChange={(e) => setRetention(Number(e.target.value))}
                className="w-full accent-[color:var(--accent)]"
              />
              <p className="text-[11px] mt-2" style={{ color: 'var(--muted)' }}>
                Maior retenção significa mais revisões; menor reduz a carga.
              </p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
