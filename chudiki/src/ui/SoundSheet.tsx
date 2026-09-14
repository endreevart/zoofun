import { useEffect, useRef, useState } from 'react';
import { getIslandAudio } from '../game/audio/AudioBus';
import { gainToSlider, sliderToGain, writeMix, type IslandMix } from '../game/audio/mix';
import {
  MIX_SLIDER_MAX,
  sliderFromClientX,
  sliderToUnit,
  unitToSliderValue,
} from '../game/audio/mixSlider';

type Props = {
  onClose(): void;
};

/** Music and narrator volume. Icons first so a pre-reader can still aim. */
export function SoundSheet({ onClose }: Props) {
  const audio = getIslandAudio();
  const [mix, setMixState] = useState<IslandMix>(() => audio.getMix());
  const mixRef = useRef(mix);

  const live = (patch: Partial<IslandMix>) => {
    const next = { ...mixRef.current, ...patch };
    mixRef.current = next;
    audio.setMix(next);
  };

  const commit = (patch: Partial<IslandMix>) => {
    const saved = writeMix({ ...mixRef.current, ...patch });
    mixRef.current = saved;
    setMixState(saved);
    audio.setMix(saved);
  };

  return (
    <>
      <button className="sound-sheet-scrim" type="button" aria-label="Закрыть" onClick={onClose} />
      <div
        className="sound-sheet"
        role="dialog"
        aria-label="Звук"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="sound-row">
          <span className="sound-icon" aria-hidden="true">
            🎵
          </span>
          <MixSlider
            label="Музыка"
            value={gainToSlider(mix.music)}
            onStart={() => {
              void audio.unlock();
            }}
            onLive={(slider) => live({ music: sliderToGain(slider) })}
            onCommit={(slider) => commit({ music: sliderToGain(slider) })}
          />
        </div>
        <div className="sound-row">
          <span className="sound-icon" aria-hidden="true">
            🗣️
          </span>
          <MixSlider
            label="Голос"
            value={gainToSlider(mix.voice)}
            onStart={() => {
              void audio.unlock();
            }}
            onLive={(slider) => live({ voice: sliderToGain(slider) })}
            onCommit={(slider) => commit({ voice: sliderToGain(slider) })}
            onRelease={() => audio.playUiSound('tap')}
          />
        </div>
      </div>
    </>
  );
}

type SliderProps = {
  label: string;
  value: number;
  onLive(next: number): void;
  onCommit(next: number): void;
  onStart?(): void;
  onRelease?(): void;
};

function MixSlider({ label, value, onLive, onCommit, onStart, onRelease }: SliderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const fillRef = useRef<HTMLSpanElement | null>(null);
  const thumbRef = useRef<HTMLSpanElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragging = useRef(false);
  const liveValue = useRef(value);
  const onLiveRef = useRef(onLive);
  const onCommitRef = useRef(onCommit);
  const onReleaseRef = useRef(onRelease);
  onLiveRef.current = onLive;
  onCommitRef.current = onCommit;
  onReleaseRef.current = onRelease;

  const paint = (next: number) => {
    liveValue.current = next;
    const pct = `${Math.round(next * 100)}%`;
    if (fillRef.current) fillRef.current.style.width = pct;
    if (thumbRef.current) thumbRef.current.style.left = pct;
    if (inputRef.current) inputRef.current.value = unitToSliderValue(next);
  };

  const applyLive = (next: number) => {
    paint(next);
    onLiveRef.current(next);
  };

  const finish = () => {
    if (!dragging.current) return;
    dragging.current = false;
    onCommitRef.current(liveValue.current);
    onReleaseRef.current?.();
  };

  useEffect(() => {
    if (dragging.current) return;
    paint(value);
  }, [value]);

  useEffect(() => {
    const fromClientX = (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      applyLive(sliderFromClientX(clientX, rect.left, rect.width));
    };

    const onMove = (event: PointerEvent) => {
      if (!dragging.current) return;
      fromClientX(event.clientX);
    };
    const onUp = () => finish();
    const onTouchMove = (event: TouchEvent) => {
      if (!dragging.current || event.touches.length === 0) return;
      event.preventDefault();
      fromClientX(event.touches[0].clientX);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('blur', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('blur', onUp);
    };
  }, []);

  const begin = (clientX: number) => {
    dragging.current = true;
    onStart?.();
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    applyLive(sliderFromClientX(clientX, rect.left, rect.width));
  };

  return (
    <div ref={trackRef} className="sound-slider">
      <span className="sound-slider-track" aria-hidden="true">
        <span
          ref={fillRef}
          className="sound-slider-fill"
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </span>
      <span
        ref={thumbRef}
        className="sound-slider-thumb"
        aria-hidden="true"
        style={{ left: `${Math.round(value * 100)}%` }}
      />
      <input
        ref={inputRef}
        className="sound-slider-input"
        type="range"
        min={0}
        max={MIX_SLIDER_MAX}
        step={1}
        defaultValue={unitToSliderValue(value)}
        aria-label={label}
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          event.stopPropagation();
          begin(event.clientX);
        }}
        onTouchStart={(event) => {
          event.stopPropagation();
          if (event.touches.length === 0) return;
          begin(event.touches[0].clientX);
        }}
        onInput={(event) => {
          dragging.current = true;
          applyLive(sliderToUnit(event.currentTarget.value));
        }}
        onChange={(event) => {
          applyLive(sliderToUnit(event.currentTarget.value));
          dragging.current = true;
          finish();
        }}
      />
    </div>
  );
}
