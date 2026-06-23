import { cn } from '../../lib/cn';

/**
 * The three Anki-style count columns, right-aligned and fixed-width so they line
 * up across rows: novos (azul) / aprendendo, inclui relearning/errados (vermelho)
 * / a revisar (verde). Zero fica esmaecido para os números que importam saltarem.
 */
export function CardCounts({
  newCount,
  learning,
  reviewDue,
  className,
}: {
  newCount: number;
  learning: number;
  reviewDue: number;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-1 sm:gap-2.5 shrink-0 mono', className)}>
      <CountCell value={newCount} color="var(--count-blue)" label="novos" />
      <CountCell value={learning} color="var(--count-red)" label="aprendendo / errados" />
      <CountCell value={reviewDue} color="var(--count-green)" label="a revisar" />
    </div>
  );
}

function CountCell({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <span
      className="w-7 sm:w-9 text-right text-xs sm:text-sm tabular-nums"
      style={{ color: value > 0 ? color : 'var(--line-strong)' }}
      title={`${value} ${label}`}
    >
      {value}
    </span>
  );
}
