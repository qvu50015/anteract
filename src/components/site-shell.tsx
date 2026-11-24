"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { AccountSettings } from "./account-settings";
import { usePathname } from "next/navigation";
import { useUnreadMessages } from "./unread-messages-provider";
import { unreadLabel } from "@/lib/messaging";
import { useEvents } from "./event-provider";

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const unread = useUnreadMessages();
  const unreadCount = unread.messages + unread.requests;
  const { events, loading } = useEvents();
  const header = useRef<HTMLElement>(null);
  useEffect(() => {
    // Remove retired local-only data, preserving auth and appearance settings.
    try {
      localStorage.removeItem("anteract-guest-v1");
      localStorage.removeItem("anteract-demo-v1");
    } catch {}
  }, []);
  useEffect(() => {
    const element = header.current;
    if (!element) return;
    let previousY = Math.max(0, window.scrollY);
    let travel = 0;
    let direction = 0;
    let frame = 0;
    let hidden = false;
    let scrolled = previousY > 16;
    element.classList.toggle("is-scrolled", scrolled);
    element.removeAttribute("data-hidden");
    const reveal = () => {
      hidden = false;
      travel = 0;
      element.removeAttribute("data-hidden");
    };
    const update = () => {
      frame = 0;
      // Clamp elastic overscroll so bouncing at either edge cannot reverse direction.
      const y = Math.max(0, Math.min(window.scrollY, document.documentElement.scrollHeight - window.innerHeight));
      const delta = y - previousY;
      previousY = y;
      if ((y > 16) !== scrolled) {
        scrolled = y > 16;
        element.classList.toggle("is-scrolled", scrolled);
      }
      if (y <= 100 || element.contains(document.activeElement) || element.querySelector('[aria-expanded="true"]')) {
        reveal();
        return;
      }
      if (!delta) return;
      const nextDirection = Math.sign(delta);
      travel = nextDirection === direction ? travel + Math.abs(delta) : Math.abs(delta);
      direction = nextDirection;
      if (travel < 8) return;
      const nextHidden = direction > 0;
      if (nextHidden !== hidden) {
        hidden = nextHidden;
        element.toggleAttribute("data-hidden", hidden);
      }
      travel = 0;
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    window.addEventListener("scroll", onScroll, { passive: true });
    element.addEventListener("focusin", reveal);
    return () => {
      window.removeEventListener("scroll", onScroll);
      element.removeEventListener("focusin", reveal);
      window.cancelAnimationFrame(frame);
    };
  }, [pathname]);
  const links = [{ href: "/", label: "Home" }, { href: "/events", label: "Browse" }, { href: "/my-events", label: "My Events" }, { href: "/chat", label: "Messages" }, { href: "/friends", label: "Friends" }];
  if (pathname === "/login" || pathname.startsWith("/auth/")) return <>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <main id="main-content" className="welcome-main">{children}</main>
  </>;
  return <>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <div className="navigation-space" aria-hidden="true" />
    <header ref={header} className="header floating-header">
      <Link className="brand" href="/" aria-label="Anteract home"><span className="brand-mark" aria-hidden="true"><img src="/anteater.svg" alt="" width="31" height="31" /></span>anteract</Link>
      <nav className="nav" aria-label="Main navigation">{links.map((link) => {
        const active = link.href === "/" ? pathname === "/" : pathname === link.href || pathname.startsWith(`${link.href}/`);
        const myEventCount = events.filter((event) => event.isJoined || event.isHost).length;
        return <Link key={link.href} href={link.href} className={active ? "nav-link active" : "nav-link"} aria-current={active ? "page" : undefined}>{link.label}{link.href === "/chat" && unreadCount > 0 && <span className="nav-count" aria-label={`${unreadCount} unread messages and requests`}>{unreadLabel(unreadCount)}</span>}{link.href === "/my-events" && !loading && myEventCount > 0 && <span className="nav-count" aria-label={`${myEventCount} joined or hosted events`}>{myEventCount}</span>}</Link>;
      })}</nav>
      <AccountSettings />
    </header>
    <main id="main-content">{children}</main>
    <footer><span>anteract · A little more connected.</span><span>Connect with your UCI community.</span></footer>
  </>;
}
