import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useDeck } from '../db/hooks';

/** Placeholder — full review engine arrives in step 6. */
export function ReviewSession() {
  const { deckId } = useParams();
  const deck = useDeck(deckId);
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6">
      <p className="mono text-xs text-muted">{deck?.name}</p>
      <h1 className="display text-3xl">Modo revisão — em construção</h1>
      <Link to="/" className="btn btn-ghost">
        <ArrowLeft size={16} /> Voltar
      </Link>
    </div>
  );
}
