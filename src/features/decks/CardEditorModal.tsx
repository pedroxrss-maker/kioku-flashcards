import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Eye, Pencil, Volume2 } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { Toggle } from '../../components/Toggle';
import { RichTextField } from './RichTextField';
import { CardHtml } from '../media/CardHtml';
import { repo } from '../../db/repositories';
import { useSettings } from '../../db/hooks';
import type { Card } from '../../db/types';

interface CardEditorModalProps {
  open: boolean;
  onClose: () => void;
  deckId: string;
  /** When set, edits this card; otherwise creates a new one. */
  card?: Card | null;
  /** Deck language, forwarded to the audio (ElevenLabs) dialog. */
  ttsLang?: string;
}

function isEmptyHtml(html: string): boolean {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim().length === 0;
}

export function CardEditorModal({
  open,
  onClose,
  deckId,
  card,
  ttsLang = 'en-US',
}: CardEditorModalProps) {
  const editing = !!card;
  const reduce = useReducedMotion();
  const settings = useSettings();
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [nonce, setNonce] = useState(0); // bumped to remount the fields
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [pronounce, setPronounce] = useState(true);

  useEffect(() => {
    if (open) {
      setFront(card?.front ?? '');
      setBack(card?.back ?? '');
      setNonce((n) => n + 1);
      setPreviewing(false);
      // Initialize from settings only on open/card change — NOT on every settings
      // reference change, otherwise toggling immediately resets (felt "stuck").
      setPronounce(card ? settings?.mutedCards?.[card.id] !== true : true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, card]);

  const canSave = !isEmptyHtml(front) && !saving;

  /** Persist the per-card pronunciation choice into settings.mutedCards. */
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
    if (editing && card) {
      await repo.updateCard(card.id, { front, back });
      await applyPronounce(card.id);
    } else {
      const created = await repo.createCard({ deckId, front, back });
      await applyPronounce(created.id);
    }
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      await persist();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function saveAndNew() {
    if (!canSave) return;
    setSaving(true);
    try {
      const created = await repo.createCard({ deckId, front, back });
      await applyPronounce(created.id);
      setFront('');
      setBack('');
      setNonce((n) => n + 1);
      setPreviewing(false);
      setPronounce(true);
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
            Cancelar
          </Button>
          {!editing && (
            <Button variant="default" onClick={saveAndNew} disabled={!canSave}>
              Salvar e adicionar
            </Button>
          )}
          <Button variant="accent" onClick={save} disabled={!canSave}>
            {editing ? 'Salvar' : 'Adicionar'}
          </Button>
        </>
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {previewing ? (
          <motion.div
            key="preview"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="field-label">Pré-visualização</p>
            <div
              style={{
                background: '#fbfbfa',
                color: '#15151a',
                border: '1px solid var(--line)',
                borderRadius: 'var(--r-lg)',
                boxShadow: 'var(--shadow-card)',
                padding: '28px 24px',
                textAlign: 'center',
              }}
            >
              <CardHtml
                html={front || '<span style="opacity:.4">(frente vazia)</span>'}
                className="card-content"
              />
              <div className="my-5 h-px w-full" style={{ background: '#0f0f0f22' }} />
              <CardHtml
                html={back || '<span style="opacity:.4">(verso vazio)</span>'}
                className="card-content"
              />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="edit"
            className="flex flex-col gap-4"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            <RichTextField
              key={`front-${nonce}`}
              label="Frente"
              valueHtml={front}
              onChange={setFront}
              autoFocus
              ttsLang={ttsLang}
            />
            <RichTextField
              key={`back-${nonce}`}
              label="Verso"
              valueHtml={back}
              onChange={setBack}
              ttsLang={ttsLang}
            />
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
    </Modal>
  );
}
