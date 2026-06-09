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
import { buildClozeHtml, isClozeHtml } from '../../lib/cloze';
import { cardTypeOf, markTypeIn, stripTypeInMark } from '../../lib/cardType';
import type { CardType } from '../../lib/cardType';
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
  ttsLang = 'en-US',
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
      const { f, b } = stored();
      const created = await repo.createCard({ deckId, front: f, back: b });
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
            <p className="field-label">Pré-visualização (resposta revelada)</p>
            <div
              className={type === 'cloze' ? 'cloze-revealed' : undefined}
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
                html={
                  (type === 'cloze' ? buildClozeHtml(front) : front) ||
                  '<span style="opacity:.4">(frente vazia)</span>'
                }
                className="card-content"
              />
              {(type !== 'cloze' || !isEmptyHtml(back)) && (
                <>
                  <div className="my-5 h-px w-full" style={{ background: '#0f0f0f22' }} />
                  <CardHtml
                    html={back || '<span style="opacity:.4">(verso vazio)</span>'}
                    className="card-content"
                  />
                </>
              )}
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
                  ttsLang={ttsLang}
                  showCloze
                />
                <p className="text-xs text-muted -mt-2" style={{ lineHeight: 1.5 }}>
                  Selecione a palavra a ocultar e clique no botão{' '}
                  <span style={{ color: 'var(--accent)' }}>{'{ }'}</span> que acende na barra.
                </p>
                <RichTextField
                  key={`clozeextra-${nonce}`}
                  label="Extra (verso, opcional)"
                  valueHtml={back}
                  onChange={setBack}
                  ttsLang={ttsLang}
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
                  ttsLang={ttsLang}
                />
                <div>
                  <span className="field-label">Resposta (o usuário digita)</span>
                  <input
                    className="field"
                    value={back.replace(/<[^>]*>/g, '')}
                    onChange={(e) => setBack(e.target.value)}
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
                  ttsLang={ttsLang}
                />
                <RichTextField
                  key={`back-${nonce}`}
                  label="Verso"
                  valueHtml={back}
                  onChange={setBack}
                  ttsLang={ttsLang}
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
    </Modal>
  );
}
