type PromoFieldProps = {
  value: string;
  error?: string;
  onChange(value: string): void;
  onApply(): void;
};

export function PromoField({ value, error, onChange, onApply }: PromoFieldProps) {
  return (
    <>
      <form
        className="pack-promo"
        onSubmit={(event) => {
          event.preventDefault();
          onApply();
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
        />
        <button className="pack-promo-apply" type="submit">
          Ок
        </button>
      </form>
      {error ? <p className="pack-promo-error">{error}</p> : null}
    </>
  );
}
