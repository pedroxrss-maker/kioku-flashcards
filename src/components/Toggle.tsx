interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  description?: string;
}

/** Brutalist on/off switch (hard edges, accent when on). */
export function Toggle({ checked, onChange, label, description }: ToggleProps) {
  const sw = (
    <span
      aria-hidden
      style={{
        width: 46,
        height: 26,
        border: '2px solid var(--line)',
        background: checked ? 'var(--accent)' : 'transparent',
        position: 'relative',
        transition: 'background 0.15s ease',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 22 : 2,
          width: 18,
          height: 18,
          background: 'var(--fg)',
          transition: 'left 0.15s ease',
        }}
      />
    </span>
  );

  if (!label) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
      >
        {sw}
      </button>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-4 w-full text-left py-1"
    >
      <span>
        <span className="block font-semibold">{label}</span>
        {description && (
          <span className="block text-sm text-muted mt-0.5">{description}</span>
        )}
      </span>
      {sw}
    </button>
  );
}
