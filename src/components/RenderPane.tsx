import React, { useEffect, useRef, useState } from 'react';
import {
  type Engine,
  type EngineInstance,
  type Layout,
  type SourceError,
  type ThemeColors,
} from '../core/engine';

/** Typing pauses this long before the notation is drawn again. */
export const RENDER_DEBOUNCE_MS = 250;

interface RenderPaneProps {
  engine: Engine | undefined;
  src: string;
  theme: ThemeColors;
  zoom: number;
  /** The engine view last chosen (score, tab), when the engine has views. */
  view?: string;
  layout: Layout;
  /** Source range to highlight in the drawing (the cursor or selection). */
  highlight?: [number, number];
  onErrors: (errors: SourceError[]) => void;
  onSourceClick: (range: [number, number]) => void;
  /** Receives the mounted instance (player, export), and null when it goes. */
  onInstance: (instance: EngineInstance | null) => void;
}

/**
 * Draws the source with the engine's renderer. The renderer is mounted once
 * per engine; text changes are drawn after a pause, keeping the scroll
 * position, and a failing render reports errors instead of breaking the pane.
 */
function RenderPane(props: RenderPaneProps) {
  const { engine, src, theme, zoom, view, layout, highlight } = props;
  const paneRef = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef<HTMLDivElement | null>(null);
  const [instance, setInstance] = useState<EngineInstance | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const callbacks = useRef(props);
  useEffect(() => {
    callbacks.current = props;
  });
  const firstOpts = useRef({ theme, zoom, view, layout });

  useEffect(() => {
    if (!engine || !targetRef.current) {
      return;
    }
    let cancelled = false;
    let mounted: EngineInstance | null = null;
    setLoadError(null);
    engine
      .mount(targetRef.current, firstOpts.current)
      .then((created) => {
        if (cancelled) {
          created.destroy();
          return;
        }
        mounted = created;
        created.onSourceClick?.((range) => callbacks.current.onSourceClick(range));
        setInstance(created);
        callbacks.current.onInstance(created);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      cancelled = true;
      setInstance(null);
      callbacks.current.onInstance(null);
      mounted?.destroy();
    };
  }, [engine]);

  useEffect(() => {
    if (!instance) {
      return;
    }
    let stale = false;
    const timer = setTimeout(() => {
      const pane = paneRef.current;
      const scroll = pane ? { top: pane.scrollTop, left: pane.scrollLeft } : null;
      instance
        .render(src)
        .then((result) => {
          if (!stale) callbacks.current.onErrors(result.errors);
        })
        .catch((error: unknown) => {
          if (!stale) {
            const message = error instanceof Error ? error.message : String(error);
            callbacks.current.onErrors([{ message, line: 1, column: 1 }]);
          }
        })
        .finally(() => {
          if (pane && scroll) {
            pane.scrollTop = scroll.top;
            pane.scrollLeft = scroll.left;
          }
        });
    }, RENDER_DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [instance, src]);

  useEffect(() => {
    instance?.setTheme(theme);
  }, [instance, theme]);

  useEffect(() => {
    instance?.setZoom?.(zoom);
  }, [instance, zoom]);

  useEffect(() => {
    if (view) instance?.setView?.(view);
  }, [instance, view]);

  useEffect(() => {
    instance?.setLayout?.(layout);
  }, [instance, layout]);

  useEffect(() => {
    if (instance && highlight) {
      instance.highlight?.(highlight);
    }
  }, [instance, highlight]);

  return (
    // Focusable, so the keyboard can scroll a drawing wider or taller than the pane.
    <div className="render-scroll" ref={paneRef} tabIndex={0} role="region" aria-label="Rendering">
      {!engine && <p className="render-status">No notation engine is available.</p>}
      {loadError && (
        <p className="render-status render-error" role="alert">
          The renderer could not be loaded ({loadError}).
        </p>
      )}
      <div className="render-target" ref={targetRef} />
    </div>
  );
}

export default RenderPane;
