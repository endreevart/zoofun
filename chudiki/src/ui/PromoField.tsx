type PromoFieldProps = {
  value: string;
  error?: string;
  busy?: boolean;
  onChange(value: string): void;
  onApply(): void;
};

export function PromoField({ value, error, busy, onChange, onApply }: PromoFieldProps) {
  return (
    <>
      <form
        className={`pack-promo${busy ? ' is-busy' : ''}`}
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) onApply();
        }}
      >
        <input
          className="pack-promo-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Промокод"
          autoComplete="off"
          spellCheck={false}
          aria-label="Промокод"
          disabled={busy}
        />
        <button className="pack-promo-apply" type="submit" disabled={busy} aria-busy={busy}>
          {busy ? '…' : 'Ок'}
        </button>
      </form>
      {error ? <p className="pack-promo-error">{error}</p> : null}
    </>
  );
}
