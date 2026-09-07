import { useCallback, useEffect, useRef, useState } from 'react';
import { floodFill, hexRgb } from '../game/drawing/floodFill';
import { PAPER_HEX, fillPaper, isPaperPixel } from '../game/drawing/paperize';

type DrawTool = 'brush' | 'erase' | 'fill';

function FillIcon({ color }: { color: string }) {
  return (
    <svg className="fill-icon" viewBox="0 0 32 32" aria-hidden="true">
      <path
        d="M7 20c0 0 1.2-3.2 3.4-4.2 1.6-.7 3.4.2 3.2 2.1-.2 1.6-1.8 2.4-3.2 3.4C8.6 22.4 7.4 24 7 26.2"
        fill={color}
        stroke="#34302f"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <ellipse cx="11.2" cy="26.6" rx="5.4" ry="2.4" fill={color} stroke="#34302f" strokeWidth="1.8" />
      <g transform="rotate(-32 19 13)">
        <path
          d="M13.2 11.2c0-3.6 10.2-3.6 10.2 0"
          fill="none"
          stroke="#34302f"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
        <path
          d="M12 11.4h13.4l-1.7 11.2c-.2 1.2-1.4 2.1-2.6 2.1h-4.8c-1.2 0-2.4-.9-2.6-2.1L12 11.4z"
          fill="#ffc93c"
          stroke="#34302f"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <rect
          x="11.3"
          y="9.4"
          width="14.8"
          height="3.3"
          rx="1.4"
          fill="#ffe08a"
          stroke="#34302f"
          strokeWidth="1.8"
        />
        <path d="M14.4 14.2h8.4" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
      </g>
    </svg>
  );
}

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
  title?: string;
  doneLabel?: string;
};

export function DrawPad({
  onCancel,
  onDone,
  title = 'Нарисуй чудика',
  doneLabel = '✨ Оживить!',
}: DrawPadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const undoStackRef = useRef<ImageData[]>([]);

  const [color, setColor] = useState(PALETTE[0]);
  const [brush, setBrush] = useState(BRUSHES[1]);
  const [tool, setTool] = useState<DrawTool>('brush');
  const [hasArt, setHasArt] = useState(false);
  const [openTool, setOpenTool] = useState<'color' | 'brush' | null>(null);

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
      const ctx = canvas.getContext('2d');
      if (ctx) fillPaper(ctx, width, height);

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

      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = tool === 'erase' ? PAPER_HEX : color;
      ctx.fillStyle = tool === 'erase' ? PAPER_HEX : color;
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
    },
    [brush, color, tool],
  );

  const fillAt = useCallback(
    (point: { x: number; y: number }) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d', { willReadFrequently: true });
      if (!canvas || !ctx) return false;
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const changed = floodFill(image.data, canvas.width, canvas.height, point.x, point.y, hexRgb(color));
      if (!changed) return false;
      ctx.putImageData(image, 0, 0);
      return true;
    },
    [color],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setOpenTool(null);
    const point = pointFromEvent(event);
    if (tool === 'fill') {
      pushUndo();
      if (!fillAt(point)) {
        undoStackRef.current.pop();
        return;
      }
      setHasArt(true);
      return;
    }
    pushUndo();
    drawingRef.current = true;
    lastPointRef.current = null;
    setHasArt(true);
    strokeTo(point);
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
    fillPaper(ctx, canvas.width, canvas.height);
    setHasArt(false);
  };

  return (
    <div className="sheet draw-sheet">
      <div className="sheet-header">
        <button className="icon-button" onClick={onCancel} aria-label="Назад">
          ⬅️
        </button>
        <h1 className="sheet-title">{title}</h1>
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

        <div className="draw-tools">
          <button className="icon-button" onClick={undo} aria-label="Отменить">
            ↩️
          </button>
          <button className="icon-button" onClick={clear} aria-label="Стереть всё">
            🧽
          </button>
          <div className="draw-tool">
            <button
              type="button"
              className="draw-chip"
              style={{ background: tool === 'erase' ? '#f4f0e4' : color }}
              data-open={openTool === 'color'}
              aria-label="Цвет"
              aria-expanded={openTool === 'color'}
              onClick={() => setOpenTool((current) => (current === 'color' ? null : 'color'))}
            />
            {openTool === 'color' ? (
              <div className="draw-pop" role="listbox" aria-label="Цвета">
                {PALETTE.map((swatch) => (
                  <button
                    key={swatch}
                    className="swatch"
                    style={{ background: swatch }}
                    data-active={tool !== 'erase' && color === swatch}
                    aria-label={`Цвет ${swatch}`}
                    onClick={() => {
                      setColor(swatch);
                      if (tool === 'erase') setTool('brush');
                      setOpenTool(null);
                    }}
                  />
                ))}
              </div>
            ) : null}
          </div>

          <div className="draw-tool">
            <button
              type="button"
              className="draw-chip draw-chip-brush"
              data-open={openTool === 'brush'}
              aria-label="Кисть"
              aria-expanded={openTool === 'brush'}
              onClick={() => {
                setTool('brush');
                setOpenTool((current) => (current === 'brush' ? null : 'brush'));
              }}
            >
              <span style={{ width: brush * 0.7, height: brush * 0.7 }} />
            </button>
            {openTool === 'brush' ? (
              <div className="draw-pop draw-pop-brushes" role="listbox" aria-label="Размер кисти">
                {BRUSHES.map((size) => (
                  <button
                    key={size}
                    className="brush"
                    data-active={tool === 'brush' && brush === size}
                    aria-label={`Кисть ${size}`}
                    onClick={() => {
                      setBrush(size);
                      setTool('brush');
                      setOpenTool(null);
                    }}
                  >
                    <span style={{ width: size * 0.8, height: size * 0.8 }} />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className="draw-chip draw-chip-fill"
            data-active={tool === 'fill'}
            aria-label="Заливка"
            onClick={() => {
              setTool('fill');
              setOpenTool(null);
            }}
          >
            <FillIcon color={color} />
          </button>
          <button
            type="button"
            className="draw-chip draw-chip-erase"
            data-active={tool === 'erase'}
            aria-label="Ластик"
            onClick={() => {
              setTool('erase');
              setOpenTool(null);
            }}
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
          {doneLabel}
        </button>
      </div>
    </div>
  );
}

function isBlank(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return true;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < data.length; i += 4) {
    if (!isPaperPixel(data[i], data[i + 1], data[i + 2], data[i + 3])) return false;
  }
  return true;
}
