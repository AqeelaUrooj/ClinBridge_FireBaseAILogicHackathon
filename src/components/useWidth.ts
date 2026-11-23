import { useEffect, useRef, useState } from 'react';

/** Current width of an element in CSS pixels, so an SVG chart can draw at real size and keep its text readable. */
export function useWidth(initial: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => { const w = Math.round(el.clientWidth); if (w > 0) setWidth(w); };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}
