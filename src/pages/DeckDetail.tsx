import { useParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { Panel } from '../components/Panel';
import { useDeck } from '../db/hooks';

/** Placeholder — full deck detail + card editor arrive in step 5. */
export function DeckDetail() {
  const { id } = useParams();
  const deck = useDeck(id);
  return (
    <div className="rise">
      <PageHeader title={deck?.name ?? 'Deck'} subtitle={deck?.category} />
      <Panel className="p-8 text-muted">Detalhe do deck — em construção.</Panel>
    </div>
  );
}
