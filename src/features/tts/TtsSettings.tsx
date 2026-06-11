import { Volume2 } from 'lucide-react';
import { Button } from '../../components/Button';
import { Toggle } from '../../components/Toggle';
import { SmoothSlider } from '../../components/SmoothSlider';
import { useSettings } from '../../db/hooks';
import { repo } from '../../db/repositories';
import { tts } from './tts';
import { useVoices } from './useVoices';
import type { AppSettings } from '../../db/types';

/** TTS settings block — composed into the Settings page. */
export function TtsSettings() {
  const settings = useSettings();
  const voices = useVoices();
  if (!settings) return null;
  const tt = settings.tts;

  const save = (patch: Partial<AppSettings['tts']>) =>
    repo.saveSettings({ tts: { ...tt, ...patch } });

  return (
    <section className="surface p-5 md:p-6">
      <div className="flex items-center gap-2 mb-4">
        <Volume2 size={16} className="text-muted" />
        <h2 className="mono text-sm text-muted">Áudio · Pronúncia (TTS)</h2>
      </div>

      {!tts.supported ? (
        <p className="text-sm text-muted">
          Seu navegador não suporta síntese de voz (Web Speech API).
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <Toggle
            checked={tt.enabled}
            onChange={(v) => save({ enabled: v })}
            label="Ativar pronúncia"
            description="Mostra o ícone de alto-falante nos cards e na revisão."
          />

          {tt.enabled && (
            <>
              <div>
                <label className="field-label" htmlFor="tts-voice">
                  Voz
                </label>
                <select
                  id="tts-voice"
                  className="field"
                  value={tt.voiceURI ?? ''}
                  onChange={(e) => save({ voiceURI: e.target.value || null })}
                >
                  <option value="">Automática (pelo idioma do deck)</option>
                  {voices.map((v, i) => (
                    <option key={`${v.voiceURI}-${i}`} value={v.voiceURI}>
                      {v.name} — {v.lang}
                    </option>
                  ))}
                </select>
              </div>

              <SmoothSlider
                id="tts-rate"
                value={tt.rate}
                min={0.5}
                max={1.5}
                step={0.025}
                onCommit={(v) => save({ rate: v })}
                label={(v) => `Velocidade · ${v.toFixed(2)}×`}
              />

              <Toggle
                checked={tt.autoPronounceFront}
                onChange={(v) => save({ autoPronounceFront: v })}
                label="Pronunciar a frente ao aparecer"
                description="Assim que um card aparece, toca o áudio dele (se houver) ou fala a frente automaticamente."
              />

              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Volume2 size={14} />}
                  onClick={() =>
                    tts.speak('Hello, this is Kioku.', {
                      lang: 'en-US',
                      voiceURI: tt.voiceURI,
                      rate: tt.rate,
                    })
                  }
                >
                  Testar voz
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
