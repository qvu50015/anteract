"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function HelpTopics({ children }: { children: ReactNode }) {
  const topics = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function openLinkedTopic() {
      const target = document.getElementById(window.location.hash.slice(1));
      if (!(target instanceof HTMLDetailsElement) || !topics.current?.contains(target)) return;
      target.open = true;
      target.scrollIntoView({ block: "start", behavior: "instant" });
    }

    openLinkedTopic();
    window.addEventListener("hashchange", openLinkedTopic);
    return () => window.removeEventListener("hashchange", openLinkedTopic);
  }, []);

  return <div className="help-accordion" ref={topics}>{children}</div>;
}
