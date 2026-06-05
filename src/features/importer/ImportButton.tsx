import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import type { ImportResult } from './apkg-import';

interface ImportButtonProps {
  variant?: 'default' | 'accent' | 'ghost';
  size?: 'sm' | 'md';
}

/** Imports an Anki .apkg (code-split: jszip + sql.js load on demand). */
export function ImportButton({ variant = 'default', size = 'md' }: ImportButtonProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { importApkg } = await import('./apkg-import');
      const res = await importApkg(file);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao importar o arquivo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        icon={<Upload size={16} />}
        onClick={() => fileRef.current?.click()}
        disabled={busy}
      >
        {busy ? 'Importando…' : 'Importar .apkg'}
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".apkg,.colpkg"
        hidden
        onChange={onFile}
      />

      <Modal
        open={!!result}
        onClose={() => setResult(null)}
        title="Importação concluída"
        footer={
          <>
            <Button variant="ghost" onClick={() => setResult(null)}>
              Fechar
            </Button>
            {result && (
              <Button
                variant="accent"
                onClick={() => {
                  const id = result.deckId;
                  setResult(null);
                  nav(`/decks/${id}`);
                }}
              >
                Ver deck
              </Button>
            )}
          </>
        }
      >
        {result && (
          <div className="text-sm">
            <p>
              Deck <b>{result.deckName}</b> importado com{' '}
              <b>{result.cardCount}</b> cards
              {result.mediaCount > 0 && <> e <b>{result.mediaCount}</b> mídias</>}.
            </p>
            {result.warnings.map((w, i) => (
              <p key={i} className="text-muted mt-2 mono text-xs">
                ⚠ {w}
              </p>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={!!error}
        onClose={() => setError(null)}
        title="Não foi possível importar"
        footer={
          <Button variant="accent" onClick={() => setError(null)}>
            Entendi
          </Button>
        }
      >
        <p className="text-sm text-muted">{error}</p>
      </Modal>
    </>
  );
}
