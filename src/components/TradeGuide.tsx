"use client";

import { useEffect, useRef, useState } from "react";

import type { ExplorerMode } from "@/types/trade";

const GUIDE_DISMISSED_KEY = "trade-atlas:guide-dismissed:2026-08";

interface TradeGuideProps {
  mode: ExplorerMode;
  onSelectMode: (mode: ExplorerMode) => void;
}

function hasDismissedGuide(): boolean {
  try {
    return window.localStorage.getItem(GUIDE_DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

function rememberGuideDismissal(): void {
  try {
    window.localStorage.setItem(GUIDE_DISMISSED_KEY, "true");
  } catch {
    // The guide still closes when browser storage is unavailable.
  }
}

export function TradeGuide({ mode, onSelectMode }: TradeGuideProps) {
  const guideRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(() => (
    typeof window !== "undefined" && !hasDismissedGuide()
  ));

  const dismiss = () => {
    setOpen(false);
    rememberGuideDismissal();
  };

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !guideRef.current?.contains(event.target)) {
        setOpen(false);
        rememberGuideDismissal();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        rememberGuideDismissal();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={guideRef} className="view-dock">
      <nav className="mode-switch" aria-label="View mode">
        <button type="button" className={mode === "country" ? "active" : ""} onClick={() => onSelectMode("country")}>Country lens</button>
        <button type="button" className={mode === "overlay" ? "active" : ""} onClick={() => onSelectMode("overlay")}>Product overlay</button>
      </nav>
      <button
        type="button"
        className="guide-toggle"
        aria-controls="trade-atlas-guide"
        aria-expanded={open}
        onClick={() => {
          if (open) dismiss();
          else setOpen(true);
        }}
      >
        <span aria-hidden="true">i</span>
        <strong>Guide</strong>
      </button>

      {open && (
        <aside id="trade-atlas-guide" className="guide-popover" aria-labelledby="trade-atlas-guide-title">
          <header>
            <div>
              <span>Quick orientation</span>
              <h3 id="trade-atlas-guide-title">Explore Trade Atlas</h3>
            </div>
            <button type="button" className="guide-close" aria-label="Close guide" onClick={dismiss}>×</button>
          </header>
          <p className="guide-summary">
            Bilateral merchandise trade from CEPII BACI, derived from UN Comtrade. Values are current USD, products use HS 2017, and 2024 is provisional.
          </p>
          <div className="guide-actions">
            <section>
              <strong>Country lens</strong>
              <p>Drag the map. Select a product percentage to compare it worldwide.</p>
            </section>
            <section>
              <strong>Product overlay</strong>
              <p>Choose a product and metric. Select a country to trace its leading trade routes.</p>
            </section>
          </div>
          <a href="https://www.cepii.fr/DATA_DOWNLOAD/baci/doc/baci_webpage.html" target="_blank" rel="noreferrer">
            Data source <span aria-hidden="true">↗</span>
          </a>
        </aside>
      )}
    </div>
  );
}
