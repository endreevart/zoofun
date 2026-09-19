import { useEffect, useMemo, useRef, useState } from 'react';
import { track } from '../analytics';
import { cardArt, type VitrineCard } from '../game/visits/visitApi';
import { arrangeVitrine, isHereCard, isMineCard, type VitrineFilter } from '../game/visits/vitrineSort';

type Props = {
  cards: VitrineCard[];
  mineId?: string | null;
  hereId?: string | null;
  hasMore?: boolean;
  loading?: boolean;
  onOpen(id: string): void;
  onClose(): void;
  onMore(): void;
  onSearch?(query: string): void;
};

const FILTERS: Array<{ id: VitrineFilter; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'new', label: 'Новые' },
  { id: 'living', label: 'С зуфиками' },
];

function PawMark() {
  return (
    <svg className="vitrine-paw" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="7" cy="7.5" r="2.2" />
      <circle cx="12" cy="5.6" r="2.3" />
      <circle cx="17" cy="7.5" r="2.2" />
      <path d="M7.2 13.6c1.4-2.2 8.2-2.2 9.6 0 1.3 2-1 5.2-4.8 5.2s-6.1-3.2-4.8-5.2z" />
    </svg>
  );
}

export function ZooVitrine({
  cards,
  mineId,
  hereId,
  hasMore,
  loading,
  onOpen,
  onClose,
  onMore,
  onSearch,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<VitrineFilter>('all');
  const searchTimer = useRef<number>(0);
  const shown = useMemo(
    () => arrangeVitrine(cards, query, filter, mineId, hereId),
    [cards, filter, hereId, mineId, query],
  );

  const asked = useRef('');
  useEffect(() => {
    if (!hasMore || loading) return;
    if (shown.length >= 8) return;
    const key = `${filter}|${query}|${cards.length}`;
    if (asked.current === key) return;
    asked.current = key;
    onMore();
  }, [cards.length, filter, hasMore, loading, onMore, query, shown.length]);

  const onScroll = () => {
    const node = scroller.current;
    if (!node || !hasMore || loading) return;
    if (node.scrollTop + node.clientHeight >= node.scrollHeight - 120) onMore();
  };

  return (
    <div className="vitrine-sheet" role="dialog" aria-label="Витрина зоопарков">
      <div className="vitrine-card">
        <header className="vitrine-head">
          <h1 className="vitrine-title">Витрина зоопарков</h1>
          <button className="vitrine-close" type="button" aria-label="Закрыть" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6.2 6.2l11.6 11.6M17.8 6.2L6.2 17.8" />
            </svg>
          </button>
        </header>

        <div className="vitrine-tools">
          <label className="vitrine-search">
            <svg className="vitrine-search-ico" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6.2" />
              <path d="M16.2 16.2L21 21" />
            </svg>
            <input
              type="search"
              value={query}
              placeholder="Номер или название"
              autoCapitalize="none"
              autoCorrect="off"
              enterKeyHint="search"
              onChange={(event) => {
                const next = event.target.value;
                setQuery(next);
                window.clearTimeout(searchTimer.current);
                searchTimer.current = window.setTimeout(() => onSearch?.(next), 280);
              }}
            />
          </label>
          <div className="vitrine-filters" role="tablist" aria-label="Показать">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                className={`vitrine-chip${filter === item.id ? ' is-on' : ''}`}
                type="button"
                role="tab"
                aria-selected={filter === item.id}
                onClick={() => {
                  setFilter(item.id);
                  track('vitrine.filter', { filter: item.id });
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="vitrine-body" ref={scroller} onScroll={onScroll}>
          {shown.length === 0 ? (
            <p className="vitrine-empty">{loading ? '…' : 'Зоопарков пока нет.'}</p>
          ) : (
            <div className="vitrine-grid">
              {shown.map((card) => {
                const mine = isMineCard(card, mineId);
                const here = isHereCard(card, hereId);
                return (
                  <button
                    key={card.id}
                    className={`vitrine-item${mine ? ' is-mine' : ''}${here ? ' is-here' : ''}`}
                    type="button"
                    onClick={() => onOpen(card.id)}
                  >
                    <span className="vitrine-shot">
                      <img className="vitrine-art" src={cardArt(card)} alt="" loading="lazy" decoding="async" />
                      {mine ? <span className="vitrine-own">твой</span> : null}
                      {here && !mine ? <span className="vitrine-here">сейчас вы тут</span> : null}
                    </span>
                    <strong className="vitrine-name">{card.title}</strong>
                    {card.code ? <span className="vitrine-code">№ {card.code}</span> : null}
                    <span className="vitrine-meta">
                      <span className="vitrine-hearts">
                        <span aria-hidden="true">♥</span> {card.joy}
                      </span>
                      <span className="vitrine-beasts">
                        <PawMark /> {card.creatures}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {hasMore ? (
            <button className="vitrine-more" type="button" disabled={loading} onClick={onMore}>
              {loading ? <span className="vitrine-spinner" aria-hidden="true" /> : null}
              <span>{loading ? 'Ещё зоопарки…' : 'Ещё'}</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
