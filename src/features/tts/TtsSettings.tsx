import { useRef, useState } from 'react';
import { Loader2, Play, Volume2 } from 'lucide-react';
import { Button } from '../../components/Button';
import { Toggle } from '../../components/Toggle';
import { useSettings } from '../../db/hooks';
import { repo } from '../../db/repositories';
import {
  groupGoogleVoices,
  isTtsConfigured,
  listGoogleVoices,
  sampleText,
  synthesizeGoogle,
} from './googleProvider';
import { TtsProviderError } from './providers';
import type { AppSettings } from '../../db/types';

type Status = { kind: 'idle' | 'ok' | 'err'; msg?: string };

/** TTS settings block, composed into the Settings page. */
export function TtsSettings() {
  const settings = useSettings();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [testing, setTesting] = useState(false);
  const previewUrl = useRef<string | null>(null);

  if (!settings) return null;
  const tt = settings.tts;
  const voices = listGoogleVoices();
  const groups = groupGoogleVoices();

  const save = (patch: Partial<AppSettings['tts']>) =>
    repo.saveSettings({ tts: { ...tt, ...patch } });

  function onPickVoice(id: string) {
    const v = voices.find((x) => x.id === id);
    if (!v) return;
    save({ googleVoiceName: v.id, googleLanguageCode: v.lang ?? tt.googleLanguageCode });
  }

  async function testVoice() {
    if (testing) return;
    setTesting(true);
    setStatus({ kind: 'idle' });
    try {
      const sample = sampleText(tt.googleLanguageCode);
      const blob = await synthesizeGoogle(sample, {
        voiceName: tt.googleVoiceName,
        languageCode: tt.googleLanguageCode,
      });
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = URL.createObjectURL(blob);
      await new Audio(previewUrl.current).play();
      setStatus({ kind: 'ok', msg: 'Voz tocada com sucesso.' });
    } catch (e) {
      setStatus({
        kind: 'err',
        msg: e instanceof TtsProviderError ? e.message : 'Falha ao gerar a prévia.',
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="surface p-5 md:p-6">
      <div className="flex items-center gap-2 mb-4">
        <Volume2 size={16} className="text-muted" />
        <h2 className="mono text-sm text-muted">Áudio · Pronúncia (TTS)</h2>
      </div>

      <div className="flex flex-col gap-4">
        <Toggle
          checked={tt.enabled}
          onChange={(v) => save({ enabled: v })}
          label="Ativar pronúncia"
          description="Toca o áudio dos cards na revisão. A voz é gerada no editor do card (ou do deck)."
        />

        {tt.enabled && (
          <>
            <div>
              <label className="field-label" htmlFor="tts-voice">
                Voz (Google)
              </label>
              <select
                id="tts-voice"
                className="field"
                value={tt.googleVoiceName}
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
              <p className="text-[11px] text-muted mt-1">
                A credencial do Google fica no servidor (Worker), não no aplicativo.
              </p>
              {!isTtsConfigured() && (
                <p className="mono text-[11px] mt-1" style={{ color: 'var(--muted)' }}>
                  O servidor de voz (Worker) ainda não foi configurado. Você pode escolher a voz
                  agora; a geração de áudio fica disponível quando o Worker estiver no ar.
                </p>
              )}
            </div>

            <Toggle
              checked={tt.autoPronounceFront}
              onChange={(v) => save({ autoPronounceFront: v })}
              label="Pronunciar a frente ao aparecer"
              description="Assim que um card aparece, toca o áudio da frente automaticamente (se houver)."
            />

            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                icon={testing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                onClick={testVoice}
                disabled={testing}
              >
                Testar voz
              </Button>
              {status.kind !== 'idle' && (
                <span
                  className="mono text-[11px]"
                  style={{ color: status.kind === 'ok' ? 'var(--accent-green)' : 'var(--accent)' }}
                >
                  {status.kind === 'ok' ? '✓' : '⚠'} {status.msg}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
