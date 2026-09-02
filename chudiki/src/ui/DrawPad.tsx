import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The drawing pad. Deliberately plain: a big sheet, fat colours, one undo and
 * one big green "done". Anything more and a four-year-old loses the thread.
 */

const PALETTE = [
  '#e8362c',
  '#ff7a2f',
  '#ffc93c',
  '#63c93f',
  '#1fa8a0',
  '#3f8fe8',
  '#8f5bd8',
  '#ff6fa5',
  '#8a5a34',
  '#f4f0e4',
  '#7d768c',
  '#241c24',
];

const BRUSHES = [10, 20, 38];
const MAX_UNDO = 8;

export type DrawPadProps = {
  onCancel(): void;
  onDone(canvas: HTMLCanvasElement): void;
};

export function DrawPad({ onCancel, onDone }: DrawPadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const undoStackRef = useRef<ImageData[]>([]);

  const [color, setColor] = useState(PALETTE[0]);
  const [brush, setBrush] = useState(BRUSHES[1]);
  const [erasing, setErasing] = useState(false);
  const [hasArt, setHasArt] = useState(false);

  // Size the bitmap to the element so strokes are crisp on any screen.
  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame) return;

    const resize = () => {
      const rect = frame.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(rect.width * ratio);
      const height = Math.round(rect.height * ratio);
      if (canvas.width === width && canvas.height === height) return;

      // Preserve whatever has been drawn so far across a rotation.
      const previous = canvas.width > 0 ? canvas.toDataURL() : null;
      canvas.width = width;
      canvas.height = height;

      if (previous) {
        const image = new Image();
        image.onload = () => canvas.getContext('2d')?.drawImage(image, 0, 0, width, height);
        image.src = previous;
      }
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const pointFromEvent = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }, []);

  const pushUndo = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || canvas.width === 0) return;
    undoStackRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
  }, []);

  const strokeTo = useCallback(
    (to: { x: number; y: number }) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      const scale = canvas.width / (frameRef.current?.getBoundingClientRect().width || 1);
      const width = brush * scale;

      ctx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over';
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const from = lastPointRef.current;
      if (!from) {
        ctx.beginPath();
        ctx.arc(to.x, to.y, width / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }

      lastPointRef.current = to;
      ctx.globalCompositeOperation = 'source-over';
    },
    [brush, color, erasing],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pushUndo();
    drawingRef.current = true;
    lastPointRef.current = null;
    setHasArt(true);
    strokeTo(pointFromEvent(event));
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    // Coalesced events keep fast strokes smooth on tablets.
    const events = event.nativeEvent.getCoalescedEvents?.() ?? [];
    if (events.length > 1) {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      for (const raw of events) {
        strokeTo({
          x: ((raw.clientX - rect.left) / rect.width) * canvas.width,
          y: ((raw.clientY - rect.top) / rect.height) * canvas.height,
        });
      }
      return;
    }
    strokeTo(pointFromEvent(event));
  };

  const handlePointerUp = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const undo = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const snapshot = undoStackRef.current.pop();
    if (!canvas || !ctx || !snapshot) return;
    ctx.putImageData(snapshot, 0, 0);
    setHasArt(undoStackRef.current.length > 0 || !isBlank(canvas));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    pushUndo();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasArt(false);
  };

  return (
    <div className="sheet">
      <div className="sheet-header">
        <button className="icon-button" onClick={onCancel} aria-label="Назад">
          ⬅️
        </button>
        <h1 className="sheet-title">Нарисуй чудика</h1>
        <button className="icon-button" onClick={undo} aria-label="Отменить">
          ↩️
        </button>
        <button className="icon-button" onClick={clear} aria-label="Стереть всё">
          🧽
        </button>
      </div>

      <div className="sheet-body">
        <div className="pad-frame" ref={frameRef}>
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
          {!hasArt && (
            <div className="pad-watermark">
              <span className="big">✏️</span>
              <span>Рисуй прямо здесь</span>
            </div>
          )}
        </div>

        <div className="tool-row">
          {PALETTE.map((swatch) => (
            <button
              key={swatch}
              className="swatch"
              style={{ background: swatch }}
              data-active={!erasing && color === swatch}
              aria-label={`Цвет ${swatch}`}
              onClick={() => {
                setColor(swatch);
                setErasing(false);
              }}
            />
          ))}
        </div>

        <div className="tool-row">
          {BRUSHES.map((size) => (
            <button
              key={size}
              className="brush"
              data-active={!erasing && brush === size}
              aria-label={`Кисть ${size}`}
              onClick={() => {
                setBrush(size);
                setErasing(false);
              }}
            >
              <span style={{ width: size * 0.8, height: size * 0.8 }} />
            </button>
          ))}
          <button
            className="brush"
            data-active={erasing}
            aria-label="Ластик"
            onClick={() => setErasing(true)}
            style={{ fontSize: 26 }}
          >
            🩹
          </button>
        </div>
      </div>

      <div className="sheet-footer">
        <button
          className="icon-button wide go"
          disabled={!hasArt}
          onClick={() => {
            const canvas = canvasRef.current;
            if (canvas) onDone(canvas);
          }}
        >
          ✨ Оживить!
        </button>
      </div>
    </div>
  );
}

function isBlank(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return true;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 20) return false;
  }
  return true;
}
