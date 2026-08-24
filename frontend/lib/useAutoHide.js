"use client";
import { useEffect, useRef, useState } from "react";

// Auto-hide chrome: visible on mount, fades out after `delay` ms of no user
// activity anywhere on the page, reappears instantly on any interaction
// (mouse move, touch, scroll/wheel, key press). Hovering the element itself
// (onMouseEnter/onMouseLeave below) pins it visible so it never fades out
// from under an actual click or read.
export function useAutoHide(active = true, delay = 2800) {
  const [hidden, setHidden] = useState(false);
  const overRef = useRef(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!active) {
      setHidden(false);
      return;
    }
    const arm = () => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (!overRef.current) setHidden(true);
      }, delay);
    };
    const wake = () => {
      setHidden(false);
      arm();
    };
    window.addEventListener("mousemove", wake);
    window.addEventListener("touchstart", wake, { passive: true });
    window.addEventListener("wheel", wake, { passive: true });
    window.addEventListener("keydown", wake);
    arm();
    return () => {
      clearTimeout(timerRef.current);
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("touchstart", wake);
      window.removeEventListener("wheel", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [active, delay]);

  const onMouseEnter = () => {
    overRef.current = true;
    setHidden(false);
    clearTimeout(timerRef.current);
  };
  const onMouseLeave = () => {
    overRef.current = false;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setHidden(true), delay);
  };

  return { hidden, onMouseEnter, onMouseLeave };
}

// Same fade behavior as useAutoHide, but a DIFFERENT reveal trigger: instead
// of any activity anywhere on the page, it only wakes when the pointer/touch
// is within `edgePx` of the top of the viewport. Meant for chrome that sits
// right at the top (a navbar) so it doesn't keep popping back up every time
// the user is just interacting with the map lower down — it's a separate,
// independent mechanism from useAutoHide, not a shared timer.
export function useTopEdgeAutoHide(active = true, { edgePx = 72, delay = 2800 } = {}) {
  const [hidden, setHidden] = useState(false);
  const overRef = useRef(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!active) {
      setHidden(false);
      return;
    }
    const arm = () => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (!overRef.current) setHidden(true);
      }, delay);
    };
    const wake = () => {
      setHidden(false);
      arm();
    };
    const onMove = (e) => {
      const y = e.touches ? e.touches[0]?.clientY : e.clientY;
      if (y != null && y <= edgePx) wake();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchstart", onMove, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    arm();
    return () => {
      clearTimeout(timerRef.current);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchstart", onMove);
      window.removeEventListener("touchmove", onMove);
    };
  }, [active, edgePx, delay]);

  // Tastiera: il focus che entra nella navbar (Tab) la tiene visibile anche
  // se il puntatore non è in cima — non è "andare in cima con un dito o un
  // cursore", ma senza restava irraggiungibile da tastiera.
  const onMouseEnter = () => {
    overRef.current = true;
    setHidden(false);
    clearTimeout(timerRef.current);
  };
  const onMouseLeave = () => {
    overRef.current = false;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setHidden(true), delay);
  };

  return {
    hidden,
    onMouseEnter, onMouseLeave,
    onFocus: onMouseEnter, onBlur: onMouseLeave,
  };
}
