import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Upload } from 'lucide-react';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { recordFeatureUse } from '../gamification/achievements';
import { beginAppBusy } from '../../lib/appBusy';
import type { CollisionResolution, ImportProgress, ImportResult } from './apkg-import';

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
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Name-collision prompt: the importer asks (before creating anything) when a
  // deck it would create shares a name with an existing one. `collision` holds the
  // colliding names while the dialog is open; `collisionResolver` resolves the
  // promise the importer is awaiting with the user's choice.
  const [collision, setCollision] = useState<string[] | null>(null);
  const collisionResolver = useRef<((c: CollisionResolution) => void) | null>(null);
  // True when the user resolved a collision with "Cancelar", so the catch below
  // closes silently (like an abort) instead of showing an error dialog.
  const cancelledByUserRef = useRef(false);

  function askCollision(names: string[]): Promise<CollisionResolution> {
    return new Promise<CollisionResolution>((resolve) => {
      collisionResolver.current = resolve;
      setCollision(names);
    });
  }
  function resolveCollision(choice: CollisionResolution) {
    if (choice === 'cancel') cancelledByUserRef.current = true;
    setCollision(null);
    const resolve = collisionResolver.current;
    collisionResolver.current = null;
    resolve?.(choice);
  }

  function cancelImport() {
    abortRef.current?.abort();
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    setProgress(null);
    cancelledByUserRef.current = false;
    const controller = new AbortController();
    abortRef.current = controller;
    // Hold the global busy guard for the WHOLE import (read → parse → upload →
    // insert), so a service-worker update can NEVER reload the page mid-import.
    // Released in the finally below on success, error AND cancel.
    const releaseBusy = beginAppBusy();

    try {
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
        setError(
          'Não foi possível ler o arquivo. Copie o .apkg/.colpkg para uma pasta local ' +
            '(Área de Trabalho ou Downloads) e tente novamente. Evite pastas sincronizadas ' +
            'na nuvem (OneDrive, Google Drive), que podem não ter o arquivo totalmente baixado.',
        );
        return;
      }

      try {
        const { importApkg } = await import('./apkg-import');
        const res = await importApkg(
          bytes,
          file.name,
          (p) => {
            if (p.total > 0) setProgress(p);
          },
          controller.signal,
          askCollision,
        );
        setResult(res);
        void recordFeatureUse('import');
      } catch (err) {
        // A user cancel (abort button OR "Cancelar" on the collision prompt) rolls
        // the import back; close silently instead of showing an error.
        if (!controller.signal.aborted && !cancelledByUserRef.current) {
          setError(err instanceof Error ? err.message : 'Falha ao importar o arquivo.');
        }
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      setProgress(null);
      releaseBusy();
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

      {/* Blocking import overlay: blurred backdrop, live progress, and the only
          way out is the Cancel button (clicks elsewhere are swallowed). Hidden
          while the name-collision prompt is up so the user can answer it. */}
      <AnimatePresence>
        {busy && !collision && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{
              background: 'rgba(0, 0, 0, 0.55)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="surface p-6 w-full max-w-sm flex flex-col items-center text-center gap-4"
              style={{ borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-pop)' }}
            >
              <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent)' }} />
              <div>
                <h3 className="font-bold text-base">Importando deck</h3>
                <p className="text-sm text-muted mt-1">
                  {progress
                    ? `Importando ${progress.phase}...`
                    : 'Lendo o arquivo... (pode levar um tempo)'}
                </p>
              </div>
              {progress && progress.total > 0 && (
                <div className="w-full">
                  <div
                    className="h-1.5 rounded-full overflow-hidden"
                    style={{ background: 'var(--surface-2)' }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.round((progress.done / progress.total) * 100)}%`,
                        background: 'var(--accent)',
                        transition: 'width 0.2s ease',
                      }}
                    />
                  </div>
                  <p className="mono text-[11px] text-muted mt-2">
                    {progress.done} / {progress.total}
                  </p>
                </div>
              )}
              <Button variant="ghost" size="sm" onClick={cancelImport}>
                Cancelar
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Name-collision prompt (Anki-style): shown when the .apkg would create a
          deck whose name already exists. Replace / keep both / cancel — applied to
          ALL colliding decks. Sits above the import overlay (z-[110]). Closing it
          any other way counts as "Criar separado" (the safe, non-destructive default). */}
      <AnimatePresence>
        {collision && (
          <motion.div
            className="fixed inset-0 z-[110] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{
              background: 'rgba(0, 0, 0, 0.55)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="surface p-6 w-full max-w-md flex flex-col gap-4"
              style={{ borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-pop)' }}
            >
              <div>
                <h3 className="font-bold text-base">Deck já existe</h3>
                {collision.length === 1 ? (
                  <p className="text-sm text-muted mt-2">
                    Você já tem um deck chamado <b className="text-fg">“{collision[0]}”</b>. O que
                    deseja fazer?
                  </p>
                ) : (
                  <div className="text-sm text-muted mt-2">
                    <p>Você já tem decks com estes nomes:</p>
                    <ul className="mt-1.5 mb-1 list-disc pl-5">
                      {collision.map((name) => (
                        <li key={name} className="text-fg">
                          {name}
                        </li>
                      ))}
                    </ul>
                    <p>O que deseja fazer?</p>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Button variant="accent" onClick={() => resolveCollision('replace')}>
                  Substituir
                </Button>
                <p className="text-xs text-muted -mt-1 mb-1">
                  Apaga o deck antigo (cards e histórico) e importa este no lugar.
                </p>
                <Button variant="default" onClick={() => resolveCollision('separate')}>
                  Criar separado
                </Button>
                <p className="text-xs text-muted -mt-1 mb-1">
                  Mantém os dois: importa como um deck novo, separado.
                </p>
                <Button variant="ghost" onClick={() => resolveCollision('cancel')}>
                  Cancelar
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
