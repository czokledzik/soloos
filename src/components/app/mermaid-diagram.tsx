"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { MaximizeIcon, MinusIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Renders Mermaid source to SVG (Mermaid is loaded on demand) inside a pan/zoom view. */
export function MermaidDiagram({ code }: { code: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const { resolvedTheme } = useTheme();
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: resolvedTheme === "dark" ? "dark" : "default",
        });
        const { svg } = await mermaid.render(`mmd-${id}`, code);
        if (!cancelled) {
          setSvg(svg);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, id, resolvedTheme]);

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 p-3 text-xs">
        <div className="mb-1 font-medium text-destructive">Diagram error</div>
        <pre className="whitespace-pre-wrap text-muted-foreground">{error}</pre>
      </div>
    );
  }
  if (!svg) return <div className="h-32 animate-pulse rounded-lg bg-muted" />;
  return <PanZoom svg={svg} />;
}

function PanZoom({ svg }: { svg: string }) {
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // Wheel zoom around the cursor. Needs a non-passive listener to stop page scrolling.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey && !e.altKey) return; // plain scroll keeps scrolling the page
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setView((v) => {
        const scale = Math.min(8, Math.max(0.2, v.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
        const k = scale / v.scale;
        return { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const zoom = (f: number) => setView((v) => ({ ...v, scale: Math.min(8, Math.max(0.2, v.scale * f)) }));

  return (
    <div className="group relative overflow-hidden rounded-lg border bg-background">
      <div
        ref={box}
        className="h-[28rem] cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) setView((v) => ({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y }));
        }}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={() => setView({ x: 0, y: 0, scale: 1 })}
      >
        <div
          className="flex h-full origin-top-left items-center justify-center [&_svg]:max-w-none"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
          // Mermaid output rendered with securityLevel "strict" (no scripts, sanitized labels).
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
      <div className="absolute top-2 right-2 flex gap-1 opacity-60 group-hover:opacity-100">
        <Button size="icon-xs" variant="outline" title="Zoom in" onClick={() => zoom(1.25)}>
          <PlusIcon />
        </Button>
        <Button size="icon-xs" variant="outline" title="Zoom out" onClick={() => zoom(0.8)}>
          <MinusIcon />
        </Button>
        <Button size="icon-xs" variant="outline" title="Reset view" onClick={() => setView({ x: 0, y: 0, scale: 1 })}>
          <MaximizeIcon />
        </Button>
      </div>
      <div className="pointer-events-none absolute bottom-1 left-2 text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100">
        Drag to pan · Ctrl/⌘ + scroll to zoom · double-click to reset
      </div>
    </div>
  );
}
