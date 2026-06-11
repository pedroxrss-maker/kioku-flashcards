import { useState } from 'react';
import { Loader2, Trash2, Volume2 } from 'lucide-react';
import { useSettings } from '../../db/hooks';
import { repo } from '../../db/repositories';
import { pushToast } from '../../lib/toast';
import { recordStorageUpload } from '../media/usage';
import { removeMedia } from '../media/storage';
import { generateAndStoreCardAudio } from './audioGen';
import type { AudioSide } from './audioGen';
import { generatedAudioSide } from './cardAudio';
import { GOOGLE_VOICES, groupGoogleVoices } from './googleProvider';
import type { Card } from '../../db/types';

/**
 * Per-card cloud audio (Google): shows WHICH side already has a generated track,
 * lets you (re)generate it for a side with a chosen voice, and remove it. The
 * Verso defaults the voice to Português; the front uses the saved default.
 */
export function GenerateCardAudioButton({
  card,
  persist = true,
  onAudioChange,
}: {
  card: Card;
  /** False for a not-yet-saved card: generate to a draft path, report via
   *  onAudioChange, and let the editor attach it when the card is created. */
  persist?: boolean;
  onAudioChange?: (audioPath: string | null, side: AudioSide) => void;
}) {
  const settings = useSettings();
  const [side, setSide] = useState<AudioSide>(
    card.audioPath ? generatedAudioSide(card, undefined) : 'front',
  );
  const [voiceName, setVoiceName] = useState(''); // '' = usar o padrão do lado
  const [languageCode, setLanguageCode] = useState('');
  const [busy, setBusy] = useState(false);
  // The single generated track (cards.audio_path). Local so it reflects changes.
  const [audioPath, setAudioPath] = useState<string | null>(card.audioPath ?? null);
  // The side the most recent in-dialog generation used: overrides the inferred
  // side instantly, and is the ONLY side signal for a not-yet-saved card.
  const [localSide, setLocalSide] = useState<AudioSide | null>(null);

  if (!settings) return null;

  // Which side the generated track speaks (just-generated, else record/chips).
  const audioSide: AudioSide | null = audioPath
    ? localSide ?? generatedAudioSide(card, settings)
    : null;
  const selectedHasAudio = side === audioSide;

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
    setVoiceName('');
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
      const r = await generateAndStoreCardAudio(
        card,
        settings,
        side,
        { voiceName: eff.name, languageCode: eff.lang },
        persist,
      );
      await recordStorageUpload(r.bytes);
      if (persist) {
        await repo.saveSettings({
          cardAudioSide: { ...(settings.cardAudioSide ?? {}), [card.id]: side },
        });
      }
      setAudioPath(r.path);
      setLocalSide(side);
      onAudioChange?.(r.path, side);
      // Toca uma vez para o usuário confirmar que deu certo.
      try {
        const url = URL.createObjectURL(r.blob);
        const a = new Audio(url);
        a.onended = () => URL.revokeObjectURL(url);
        void a.play().catch(() => URL.revokeObjectURL(url));
      } catch {
        /* ignore */
      }
      pushToast('success', selectedHasAudio ? 'Áudio regerado e salvo na nuvem.' : 'Áudio gerado e salvo na nuvem.');
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Falha ao gerar o áudio.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy || !settings || !audioPath) return;
    setBusy(true);
    try {
      const path = audioPath;
      if (persist) {
        await repo.updateCard(card.id, { audioPath: null });
        const next = { ...(settings.cardAudioSide ?? {}) };
        delete next[card.id];
        await repo.saveSettings({ cardAudioSide: next });
      }
      try {
        await removeMedia(path); // libera o arquivo no Storage (best-effort)
      } catch {
        /* ignore */
      }
      setAudioPath(null);
      setLocalSide(null);
      onAudioChange?.(null, side);
      pushToast('success', 'Áudio removido.');
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Falha ao remover o áudio.');
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
              className="px-2.5 py-1 text-xs rounded-[var(--r-sm)] transition-colors inline-flex items-center gap-1.5"
              style={{
                background: side === s ? 'var(--accent)' : 'transparent',
                color: side === s ? '#fff' : 'var(--muted)',
              }}
            >
              {s === 'front' ? 'Frente' : 'Verso'}
              {s === audioSide && (
                <span
                  className="inline-block rounded-full"
                  style={{ width: 6, height: 6, background: side === s ? '#fff' : 'var(--accent-green)' }}
                />
              )}
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
          {busy ? 'Gerando...' : selectedHasAudio ? 'Regerar áudio' : 'Gerar áudio'}
        </button>
        {selectedHasAudio && !busy && (
          <button
            type="button"
            onClick={remove}
            className="btn btn-ghost btn-sm"
            title="Remover o áudio gerado deste lado"
          >
            <Trash2 size={14} /> Remover
          </button>
        )}
      </div>

      <p className="mono text-[11px]" style={{ color: audioSide ? 'var(--accent-green)' : 'var(--muted)' }}>
        {audioSide === 'front'
          ? '✓ Áudio salvo na frente.'
          : audioSide === 'back'
            ? '✓ Áudio salvo no verso.'
            : 'Nenhum áudio gerado para este card ainda.'}
      </p>

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
