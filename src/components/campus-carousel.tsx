"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { campusPhotos } from "@/lib/campus-photos";

const rotationInterval = 4500;
const photoSizes = "(max-width: 760px) 100vw, 650px";
type Direction = 1 | -1;
type Slide = { current: number; previous: number | null; direction: Direction };

function advance(slide: Slide, direction: Direction): Slide {
  return {
    current: (slide.current + direction + campusPhotos.length) % campusPhotos.length,
    previous: slide.current,
    direction,
  };
}

export function CampusCarousel() {
  const [slide, setSlide] = useState<Slide>({ current: 0, previous: null, direction: 1 });
  const [playback, setPlayback] = useState<boolean | null>(null);
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const playing = playback ?? !reducedMotion;
  const photo = campusPhotos[slide.current];

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(motion.matches);
    const updateVisibility = () => setVisible(!document.hidden);
    updateMotion();
    updateVisibility();
    motion.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      motion.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  useEffect(() => {
    if (!playing || hovered || !visible) return;
    const timer = window.setInterval(() => setSlide(current => advance(current, 1)), rotationInterval);
    return () => window.clearInterval(timer);
  }, [playing, hovered, visible]);

  function moveManually(direction: Direction) {
    setPlayback(false);
    setSlide(current => advance(current, direction));
  }

  return (
    <div
      className="campus-carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label="UC Irvine landmarks"
      data-direction={slide.direction === 1 ? "next" : "previous"}
      data-transition={slide.previous !== null ? "active" : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={event => {
        if (event.target.matches(":focus-visible")) setPlayback(false);
      }}
    >
      {campusPhotos.map((entry, index) => (
        <div
          key={entry.image}
          className="campus-carousel-slide"
          data-slide={index === slide.current ? "current" : index === slide.previous ? "previous" : "inactive"}
          aria-hidden="true"
        >
          <Image
            src={entry.image}
            alt=""
            fill
            sizes={photoSizes}
            preload={index === 0}
            loading={index === 0 ? undefined : "eager"}
            fetchPriority={index === 0 ? undefined : "low"}
            unoptimized={index !== 0}
          />
        </div>
      ))}
      <div className="campus-carousel-bar">
        <p className="campus-carousel-caption" aria-live={playing ? "off" : "polite"} aria-atomic="true">{photo.name}</p>
        <div className="campus-carousel-controls">
          <button type="button" aria-label={playing ? "Pause campus photos" : "Play campus photos"} onClick={() => { setHovered(false); setPlayback(!playing); }}>
            {playing ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12m6-12v12" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 9 6-9 6z" /></svg>}
          </button>
          <button type="button" aria-label="Previous campus photo" onClick={() => moveManually(-1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg>
          </button>
          <button type="button" aria-label="Next campus photo" onClick={() => moveManually(1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6" /></svg>
          </button>
          <Link href="/help#campus-photos" aria-label="Campus photo credits" title="Photo credits">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 11v5m0-8h.01" /></svg>
          </Link>
        </div>
      </div>
    </div>
  );
}
