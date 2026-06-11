import { useEffect, useRef, useState } from 'react';
import { Loader2, Play, Sparkles } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { useSettings } from '../../db/hooks';
import { pushToast } from '../../lib/toast';
import { recordStorageUpload, warnIfStorageHigh } from '../media/usage';
import { generateDeckAudio } from './audioGen';
import type { AudioSide, DeckAudioProgress } from './audioGen';
import { isTtsConfigured, listGoogleVoices, synthesizeGoogle } from './googleProvider';
import { TtsProviderError, type TtsVoice } from './providers';

interface Props {
  open: boolean;
  onClose: () => void;
  deckId: string;
  deckName: string;
}

/** Frase curta de teste, no idioma da voz escolhida. */
const SAMPLE: Record<string, string> = {
  'pt-BR': 'Olá! Esta é uma voz de teste do Kioku.',
  'en-US': 'Hello! This is a Kioku test voice.',
};

function groupVoices(voices: TtsVoice[]): Array<{ lang: string; label: string; items: TtsVoice[] }> {
  const order: Array<{ lang: string; label: string }> = [
    { lang: 'en-US', label: 'Inglês (EUA)' },
    { lang: 'pt-BR', label: 'Português (BR)' },
  ];
  return order
    .map((g) => ({ ...g, items: voices.filter((v) => v.lang === g.lang) }))
    .filter((g) => g.items.length > 0);
}

/**
 * Janela para gerar áudio de um deck inteiro: escolhe a voz e o lado (frente ou
 * verso) antes de gerar, e NUNCA sobrescreve cards que já têm áudio. Mostra o
 * progresso e um resumo ao final.
 */
export function GenerateDeckAudioDialog({ open, onClose, deckId, deckName }: Props) {
  const settings = useSettings();
  const voices = listGoogleVoices();
  const groups = groupVoices(voices);

  const [voiceName, setVoiceName] = useState('');
  const [languageCode, setLanguageCode] = useState('en-US');
  const [side, setSide] = useState<AudioSide>('front');
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [prog, setProg] = useState<DeckAudioProgress | null>(null);
  const previewUrl = useRef<string | null>(null);

  // Abre com a voz/idioma padrão das Configurações.
  useEffect(() => {
    if (!open || !settings) return;
    setVoiceName(settings.tts.googleVoiceName);
    setLanguageCode(settings.tts.googleLanguageCode);
    setSide('front');
    setProg(null);
  }, [open, settings]);

  function onPickVoice(id: string) {
    const v = voices.find((x) => x.id === id);
    if (!v) return;
    setVoiceName(v.id);
    setLanguageCode(v.lang ?? languageCode);
  }

  async function testVoice() {
    if (testing || busy || !voiceName) return;
    setTesting(true);
    try {
      const sample = SAMPLE[languageCode] ?? SAMPLE['en-US'];
      const blob = await synthesizeGoogle(sample, { voiceName, languageCode });
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = URL.createObjectURL(blob);
      await new Audio(previewUrl.current).play();
    } catch (e) {
      pushToast('error', e instanceof TtsProviderError ? e.message : 'Falha ao testar a voz.');
    } finally {
      setTesting(false);
    }
  }

  async function generate() {
    if (busy || !settings) return;
    setBusy(true);
    setProg({ done: 0, total: 0 });
    try {
      const res = await generateDeckAudio(deckId, settings, (p) => setProg(p), side, {
        voiceName,
        languageCode,
      });
      if (res.bytes > 0) {
        const total = await recordStorageUpload(res.bytes);
        warnIfStorageHigh(total);
      }
      if (res.total === 0) {
        pushToast('info', 'Todos os cards com texto já têm áudio neste deck.');
      } else {
        let msg = `Áudio gerado para ${res.ok} ${res.ok === 1 ? 'card' : 'cards'}.`;
        if (res.failed > 0) msg += ` ${res.failed} ${res.failed === 1 ? 'falhou' : 'falharam'}.`;
        if (res.stopped) {
          msg += ' Geração interrompida (servidor de voz indisponível ou limite atingido).';
        }
        pushToast(res.failed > 0 || res.stopped ? 'info' : 'success', msg);
      }
      onClose();
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Falha ao gerar áudio do deck.');
    } finally {
      setBusy(false);
      setProg(null);
    }
  }

  if (!settings) return null;

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Gerar áudio do deck"
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant="accent"
            icon={busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            onClick={generate}
            disabled={busy || !voiceName}
          >
            {busy ? `Gerando ${prog?.done ?? 0}/${prog?.total ?? 0}` : 'Gerar áudio'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted" style={{ lineHeight: 1.5 }}>
          Gera um MP3 para cada card de{' '}
          <strong style={{ color: 'var(--fg)' }}>{deckName}</strong> que ainda não tem áudio. Cards
          que já têm áudio (anexado ou gerado) são mantidos, nada é sobrescrito.
        </p>

        {!isTtsConfigured() && (
          <p className="mono text-[11px]" style={{ color: 'var(--accent)' }}>
            O servidor de voz (Worker) ainda não foi configurado, a geração ficará indisponível.
          </p>
        )}

        <div>
          <span className="field-label">Lado a falar</span>
          <div
            className="inline-flex p-0.5 rounded-[var(--r-sm)]"
            style={{ background: 'var(--surface-2)' }}
          >
            {(['front', 'back'] as AudioSide[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSide(s)}
                className="px-3 py-1 text-sm rounded-[var(--r-sm)] transition-colors"
                style={{
                  background: side === s ? 'var(--accent)' : 'transparent',
                  color: side === s ? '#fff' : 'var(--muted)',
                }}
              >
                {s === 'front' ? 'Frente' : 'Verso'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="gda-voice">
            Voz
          </label>
          <select
            id="gda-voice"
            className="field"
            value={voiceName}
            onChange={(e) => onPickVoice(e.target.value)}
          >
            {groups.map((g) => (
              <optgroup key={g.lang} label={g.label}>
                {g.items.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <div className="mt-2">
            <Button
              variant="ghost"
              size="sm"
              icon={testing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              onClick={testVoice}
              disabled={busy || testing || !voiceName}
            >
              Testar voz
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
