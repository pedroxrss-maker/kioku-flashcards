import { useState } from 'react';
import { Check, Loader2, Volume2 } from 'lucide-react';
import { useSettings } from '../../db/hooks';
import { pushToast } from '../../lib/toast';
import { recordStorageUpload } from '../media/usage';
import { generateAndStoreCardAudio } from './audioGen';
import type { AudioSide } from './audioGen';
import type { Card } from '../../db/types';

/**
 * Per-card control to generate (or regenerate) ElevenLabs audio into Storage.
 * Front by default, with a Frente/Verso choice. Requires a configured key.
 */
export function GenerateCardAudioButton({ card }: { card: Card }) {
  const settings = useSettings();
  const [side, setSide] = useState<AudioSide>('front');
  const [busy, setBusy] = useState(false);
  const [hasAudio, setHasAudio] = useState<boolean>(!!card.audioPath);

  if (!settings) return null;
  const hasKey = !!settings.tts.elevenLabsApiKey?.trim();

  async function generate() {
    if (busy || !settings) return;
    if (!hasKey) {
      pushToast('error', 'Configure a chave da ElevenLabs nas Configurações para gerar áudio.');
      return;
    }
    setBusy(true);
    try {
      const r = await generateAndStoreCardAudio(card, settings, side);
      await recordStorageUpload(r.bytes);
      setHasAudio(true);
      pushToast('success', hasAudio ? 'Áudio regerado e salvo na nuvem.' : 'Áudio gerado e salvo na nuvem.');
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Falha ao gerar o áudio.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="inline-flex p-0.5 rounded-[var(--r-sm)]" style={{ background: 'var(--surface-2)' }}>
        {(['front', 'back'] as AudioSide[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSide(s)}
            className="px-2.5 py-1 text-xs rounded-[var(--r-sm)] transition-colors"
            style={{
              background: side === s ? 'var(--accent)' : 'transparent',
              color: side === s ? '#fff' : 'var(--muted)',
            }}
          >
            {s === 'front' ? 'Frente' : 'Verso'}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={generate}
        disabled={busy}
        className="btn btn-ghost btn-sm disabled:opacity-50"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Volume2 size={14} />}
        {busy ? 'Gerando...' : hasAudio ? 'Regerar áudio' : 'Gerar áudio'}
      </button>
      {hasAudio && !busy && (
        <span
          className="inline-flex items-center gap-1 mono text-[11px]"
          style={{ color: 'var(--accent-green)' }}
        >
          <Check size={12} /> áudio salvo
        </span>
      )}
    </div>
  );
}
