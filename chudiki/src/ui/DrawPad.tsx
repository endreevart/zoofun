import { useCallback, useEffect, useRef, useState } from 'react';
import { assetUrl } from '../assetUrl';
import { floodFill, hexRgb } from '../game/drawing/floodFill';
import { PAPER_HEX, fillPaper, isPaperPixel } from '../game/drawing/paperize';

type DrawTool = 'brush' | 'erase' | 'fill';
type DrawIconName = 'brush' | 'erase' | 'fill' | 'clear' | 'sparkle';

function DrawToolIcon({ name }: { name: DrawIconName }) {
  return <img className="draw-tool-ico" src={assetUrl(`ui/draw/${name}.png`)} alt="" draggable={false} />;
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
  doneLabel = 'Оживить',
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
          <button className="draw-undo" type="button" onClick={undo} aria-label="Отменить">
            ↩
          </button>
          <div className="draw-tiles">
            <button
              type="button"
              className="draw-tile"
              data-active={tool === 'brush'}
              aria-label="Кисть"
              onClick={() => {
                setTool('brush');
                setOpenTool(null);
              }}
            >
              <DrawToolIcon name="brush" />
              <span className="draw-tile-label">Кисть</span>
            </button>
            <button
              type="button"
              className="draw-tile"
              data-active={tool === 'erase'}
              aria-label="Ластик"
              onClick={() => {
                setTool('erase');
                setOpenTool(null);
              }}
            >
              <DrawToolIcon name="erase" />
              <span className="draw-tile-label">Ластик</span>
            </button>
            <button
              type="button"
              className="draw-tile"
              data-active={tool === 'fill'}
              aria-label="Заливка"
              onClick={() => {
                setTool('fill');
                setOpenTool(null);
              }}
            >
              <DrawToolIcon name="fill" />
              <span className="draw-tile-label">Заливка</span>
            </button>
            <button type="button" className="draw-tile" aria-label="Очистить" onClick={clear}>
              <DrawToolIcon name="clear" />
              <span className="draw-tile-label">Очистить</span>
            </button>
            <div className="draw-tool">
              <button
                type="button"
                className="draw-tile"
                data-open={openTool === 'color'}
                aria-label="Цвет"
                aria-expanded={openTool === 'color'}
                onClick={() => setOpenTool((current) => (current === 'color' ? null : 'color'))}
              >
                <span
                  className="draw-color-dot"
                  style={{ background: tool === 'erase' ? '#f4f0e4' : color }}
                />
                <span className="draw-tile-label">Цвет</span>
              </button>
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
                className="draw-tile"
                data-open={openTool === 'brush'}
                aria-label="Толщина"
                aria-expanded={openTool === 'brush'}
                onClick={() => setOpenTool((current) => (current === 'brush' ? null : 'brush'))}
              >
                <span className="draw-thick" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="draw-tile-label">Толщина</span>
              </button>
              {openTool === 'brush' ? (
                <div className="draw-pop draw-pop-brushes" role="listbox" aria-label="Толщина">
                  {BRUSHES.map((size) => (
                    <button
                      key={size}
                      className="brush"
                      data-active={brush === size}
                      aria-label={`Толщина ${size}`}
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
          </div>
          <button
            className="draw-revive"
            type="button"
            disabled={!hasArt}
            onClick={() => {
              const canvas = canvasRef.current;
              if (canvas) onDone(canvas);
            }}
          >
            <DrawToolIcon name="sparkle" />
            <span>{doneLabel}</span>
          </button>
        </div>
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
