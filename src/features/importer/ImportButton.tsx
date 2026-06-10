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

/** Read a Blob via FileReader, a DIFFERENT code path than `Blob.arrayBuffer()`,
 *  which can throw NotReadableError on some large or cloud-synced files. */
function readViaFileReader(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as ArrayBuffer);
    fr.onerror = () => reject(fr.error ?? new Error('FileReader failed'));
    fr.readAsArrayBuffer(blob);
  });
}

/**
 * Read a File fully into memory, robustly, immediately inside the user gesture
 * (so the File reference never goes stale). Big/cloud-synced .colpkg collections
 * (the kind that carry subdecks) often make `Blob.arrayBuffer()` throw
 * NotReadableError, so we escalate through progressively more resilient
 * strategies before giving up:
 *   1) file.arrayBuffer()             : fast path
 *   2) FileReader over the whole file : different API, frequently succeeds where 1 fails
 *   3) FileReader chunk by chunk      : most resilient for very large files
 */
async function readFileBytes(file: File): Promise<Uint8Array> {
  try {
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    /* try FileReader next */
  }
  try {
    return new Uint8Array(await readViaFileReader(file));
  } catch {
    /* try chunked FileReader next */
  }
  const CHUNK = 4 * 1024 * 1024; // 4 MB
  const out = new Uint8Array(file.size);
  let offset = 0;
  while (offset < file.size) {
    const end = Math.min(offset + CHUNK, file.size);
    const buf = await readViaFileReader(file.slice(offset, end));
    out.set(new Uint8Array(buf), offset);
    offset = end;
  }
  return out;
}

/** Imports an Anki .apkg (code-split: jszip + sql.js load on demand). */
export function ImportButton({ variant = 'default', size = 'md' }: ImportButtonProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    setProgress(null);

    // Read the FULL file into memory NOW, synchronously within this user-gesture
    // handler, before any deck parsing or other awaits. Large or cloud-synced
    // files (OneDrive/Drive) can lose their File reference if the read is
    // deferred, which surfaces as "the requested file could not be read".
    let bytes: Uint8Array;
    try {
      bytes = await readFileBytes(file);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[import] não foi possível ler o arquivo', err);
      setBusy(false);
      setError(
        'Não foi possível ler o arquivo. Copie o .apkg/.colpkg para uma pasta local ' +
          '(Área de Trabalho ou Downloads) e tente novamente. Evite pastas sincronizadas ' +
          'na nuvem (OneDrive, Google Drive), que podem não ter o arquivo totalmente baixado.',
      );
      return;
    }

    try {
      const { importApkg } = await import('./apkg-import');
      const res = await importApkg(bytes, file.name, (p) => {
        if (p.total > 0) setProgress(`${p.phase} ${p.done}/${p.total}`);
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao importar o arquivo.');
    } finally {
      setBusy(false);
      setProgress(null);
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
        {busy
          ? progress
            ? `Importando ${progress}`
            : 'Importando… (pode levar um tempo)'
          : 'Importar .apkg'}
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
              {result.deckCount > 1 ? (
                <>
                  <b>{result.deckCount}</b> decks importados com{' '}
                </>
              ) : (
                <>
                  Deck <b>{result.deckName}</b> importado com{' '}
                </>
              )}
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
