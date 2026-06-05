import { useState } from 'react';
import { Button } from '../components/Button';
import { Pill } from '../components/Pill';
import { Panel } from '../components/Panel';
import { Modal } from '../components/Modal';

/**
 * Step 1 placeholder showcase — verifies the design system renders.
 * Replaced by the router shell in step 4.
 */
export function App() {
  const [open, setOpen] = useState(false);
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="mono text-accent text-xs mb-3">Kioku · Design System</p>
      <h1 className="display" style={{ fontSize: 64 }}>
        Lembre<span className="text-accent">.</span>
      </h1>
      <p className="text-muted mt-4 max-w-md">
        Flashcards com repetição espaçada. SM-2 e FSRS. Bonito, rápido,
        brutalista.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Pill active>Revisão</Pill>
        <Pill>Vocabulário</Pill>
        <Pill muted>Gramática</Pill>
      </div>

      <div className="mt-8 flex flex-wrap gap-4">
        <Button variant="mega" onClick={() => setOpen(true)}>
          Revisar agora
        </Button>
        <Button variant="accent">Novo deck</Button>
        <Button variant="ghost">Configurações</Button>
      </div>

      <Panel raised className="mt-10 p-8">
        <p className="mono text-muted text-xs">Frente</p>
        <p className="card-content mt-2">ephemeral</p>
      </Panel>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Tudo certo"
        footer={<Button variant="accent" onClick={() => setOpen(false)}>Fechar</Button>}
      >
        <p className="text-muted">O sistema de design está funcionando.</p>
      </Modal>
    </main>
  );
}
