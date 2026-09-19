import { useMemo } from 'react';
import { heartRainCount } from '../game/visits/joy';

export function HeartRain({
  hearts,
  show,
  brief,
}: {
  hearts: number;
  show: boolean;
  brief?: boolean;
}) {
  const flakes = useMemo(() => {
    const n = brief ? 8 : heartRainCount(hearts);
    return Array.from({ length: n }, (_, index) => ({
      id: index,
      left: 8 + ((index * 37) % 84),
      delay: (index % 8) * 0.08,
      size: 18 + (index % 5) * 6,
    }));
  }, [brief, hearts]);
  if (!show || hearts <= 0) return null;
  return (
    <div className="heart-rain" aria-hidden="true">
      {flakes.map((flake, index) => (
        <span
          key={flake.id}
          className={`heart-rain-bit${brief ? ' is-brief' : ''}`}
          style={{
            left: `${flake.left}%`,
            animationDelay: `${brief ? index * 0.03 : flake.delay}s`,
            fontSize: brief ? 22 + (index % 3) * 4 : flake.size,
          }}
        >
          ♥
        </span>
      ))}
    </div>
  );
}
