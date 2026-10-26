import { useLayoutEffect, useRef, useState } from 'react';

// Fills its box with the Drawing window's drawing, framed the same way (centre, zoom, rotation)
export default function DrawingArt({ drawing, zoom = 1, invert = false, paper = '#fff', className = '', style }) {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(ref.current); return () => ro.disconnect();
  }, []);
  const src = drawing?.src;
  const iw = src?.w || 1, ih = src?.h || 1, rot = drawing?.rotate || 0;
  const rw = rot % 180 ? ih : iw, rh = rot % 180 ? iw : ih;
  const k = Math.max(size.w / rw, size.h / rh) * (drawing?.zoom || 1) * zoom; // cover the box
  const cx = (drawing?.view?.u ?? 0.5) * size.w, cy = (drawing?.view?.v ?? 0.5) * size.h;
  return (
    <div ref={ref} className={`dart ${className}`} style={{ background: invert ? '#000' : paper, ...style }} aria-hidden="true">
      {src && size.w > 0 && (
        <img src={src.url} alt="" draggable={false} style={{
          width: iw, height: ih, filter: invert ? 'invert(1)' : undefined,
          transform: `translate(${cx}px, ${cy}px) rotate(${rot}deg) scale(${k}) translate(${-iw / 2}px, ${-ih / 2}px)`,
        }} />
      )}
    </div>
  );
}
