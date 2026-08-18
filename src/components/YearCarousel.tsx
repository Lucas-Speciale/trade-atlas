"use client";

import { useRef, useState, type PointerEvent, type WheelEvent } from "react";

interface YearCarouselProps {
  years: number[];
  value: number;
  provisionalYears: number[];
  loading: boolean;
  onChange: (year: number) => void;
}

const SLOT_WIDTH = 72;

export function YearCarousel({ years, value, provisionalYears, loading, onChange }: YearCarouselProps) {
  const activeIndex = Math.max(0, years.indexOf(value));
  const dragRef = useRef<{ pointerId: number; startX: number } | null>(null);
  const wheelRef = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const selectIndex = (index: number) => {
    const next = years[Math.max(0, Math.min(years.length - 1, index))];
    if (next !== undefined && next !== value) onChange(next);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX };
    setIsDragging(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    setDragOffset(event.clientX - dragRef.current.startX);
  };

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    const steps = Math.round(-dragOffset / SLOT_WIDTH);
    selectIndex(activeIndex + steps);
    setDragOffset(0);
    setIsDragging(false);
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const now = Date.now();
    if (now - wheelRef.current < 220) return;
    wheelRef.current = now;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    selectIndex(activeIndex + (delta > 0 ? 1 : -1));
  };

  return (
    <div
      className={`year-carousel${isDragging ? " is-dragging" : ""}`}
      role="group"
      aria-label="Trade data year"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onWheel={handleWheel}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") selectIndex(activeIndex - 1);
        if (event.key === "ArrowRight") selectIndex(activeIndex + 1);
        if (event.key === "Home") selectIndex(0);
        if (event.key === "End") selectIndex(years.length - 1);
      }}
    >
      <div className="year-carousel-title">
        <span>Year</span>
        {loading && <i aria-label="Loading year" />}
      </div>
      <div className="year-carousel-window">
        <div
          className="year-carousel-track"
          style={{
            transform: `translate3d(${-activeIndex * SLOT_WIDTH - SLOT_WIDTH / 2 + dragOffset}px, 0, 0)`,
          }}
        >
          {years.map((year, index) => {
            const distance = Math.abs(index - activeIndex);
            return (
              <button
                key={year}
                type="button"
                className={year === value ? "active" : ""}
                style={{ opacity: Math.max(0.2, 1 - distance * 0.23) }}
                aria-pressed={year === value}
                onClick={(event) => {
                  event.stopPropagation();
                  onChange(year);
                }}
              >
                {year}
                {provisionalYears.includes(year) && <small>provisional</small>}
              </button>
            );
          })}
        </div>
      </div>
      <span className="year-carousel-hint">Drag, scroll, or use arrow keys</span>
    </div>
  );
}
