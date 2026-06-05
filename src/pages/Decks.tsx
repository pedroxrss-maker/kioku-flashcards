import { PageHeader } from '../components/PageHeader';
import { DeckBrowser } from '../features/decks/DeckBrowser';
import { useDecks } from '../db/hooks';

export function Decks() {
  const decks = useDecks();
  return (
    <div className="rise">
      <PageHeader
        title="Meus Decks"
        subtitle={`${decks.length} ${decks.length === 1 ? 'deck' : 'decks'}`}
      />
      <DeckBrowser />
    </div>
  );
}
