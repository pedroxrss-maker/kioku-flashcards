import { useState } from 'react';
import { Check, Loader2, Volume2 } from 'lucide-react';
import { useSettings } from '../../db/hooks';
import { repo } from '../../db/repositories';
import { pushToast } from '../../lib/toast';
import { recordStorageUpload } from '../media/usage';
import { generateAndStoreCardAudio } from './audioGen';
import type { AudioSide } from './audioGen';
import { GOOGLE_VOICES, groupGoogleVoices } from './googleProvider';
import type { Card } from '../../db/types';

/**
 * Per-card control to generate (or regenerate) cloud audio (Google) into
 * Storage. Pick the side (Frente/Verso) and the voice. Switching to Verso
 * defaults the voice to Português; the front defaults to the saved voice. Both
 * are overridable in the dropdown.
 */
export function GenerateCardAudioButton({ card }: { card: Card }) {
  const settings = useSettings();
  const [side, setSide] = useState<AudioSide>('front');
  const [voiceName, setVoiceName] = useState(''); // '' = usar o padrão do lado
  const [languageCode, setLanguageCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [hasAudio, setHasAudio] = useState<boolean>(!!card.audioPath);

  if (!settings) return null;

  const groups = groupGoogleVoices();
  const ptDefault = GOOGLE_VOICES.find((v) => v.lang === 'pt-BR');
  // Voz efetiva: a escolhida, senão o padrão do lado (verso -> Português).
  const eff =
    voiceName
      ? { name: voiceName, lang: languageCode }
      : side === 'back' && ptDefault
        ? { name: ptDefault.id, lang: ptDefault.lang ?? 'pt-BR' }
        : { name: settings.tts.googleVoiceName, lang: settings.tts.googleLanguageCode };

  function pickSide(s: AudioSide) {
    setSide(s);
    setVoiceName(''); // volta ao padrão daquele lado
    setLanguageCode('');
  }
  function onPickVoice(id: string) {
    const v = GOOGLE_VOICES.find((x) => x.id === id);
    if (!v) return;
    setVoiceName(v.id);
    setLanguageCode(v.lang ?? '');
  }

  async function generate() {
    if (busy || !settings) return;
    setBusy(true);
    try {
      const r = await generateAndStoreCardAudio(card, settings, side, {
        voiceName: eff.name,
        languageCode: eff.lang,
      });
      await recordStorageUpload(r.bytes);
      // Lembra de qual lado este áudio gerado fala (frente/verso).
      await repo.saveSettings({
        cardAudioSide: { ...(settings.cardAudioSide ?? {}), [card.id]: side },
      });
      setHasAudio(true);
      pushToast('success', hasAudio ? 'Áudio regerado e salvo na nuvem.' : 'Áudio gerado e salvo na nuvem.');
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Falha ao gerar o áudio.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex p-0.5 rounded-[var(--r-sm)]" style={{ background: 'var(--surface-2)' }}>
          {(['front', 'back'] as AudioSide[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => pickSide(s)}
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
      <div className="flex items-center gap-2">
        <span className="mono text-[11px] text-muted shrink-0">Voz</span>
        <select
          className="field"
          style={{ maxWidth: 320 }}
          value={eff.name}
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
      </div>
    </div>
  );
}
