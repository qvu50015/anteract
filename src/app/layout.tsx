import type { Metadata } from "next";
import "./globals.css";
import "@/components/getting-started.css";
import { EventProvider } from "@/components/event-provider";
import { UnreadMessagesProvider } from "@/components/unread-messages-provider";
import { SiteShell } from "@/components/site-shell";
import { GettingStartedProvider } from "@/components/getting-started-provider";

export const metadata: Metadata = {
  title: "Anteract | Find your people",
  description: "Discover a hangout and connect with other UCI students.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('anteract-appearance');document.documentElement.dataset.theme=t==='dark'||t==='light'?t:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}})()` }} /></head><body><UnreadMessagesProvider><EventProvider><GettingStartedProvider><SiteShell>{children}</SiteShell></GettingStartedProvider></EventProvider></UnreadMessagesProvider></body></html>;
}
