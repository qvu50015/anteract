"use client";

import Link from "next/link";
import { useId } from "react";
import { guideSteps } from "@/lib/getting-started";
import { useGettingStarted } from "./getting-started-provider";

export function GettingStarted({ alwaysOpen = false }: { alwaysOpen?: boolean }) {
  const { ready, progress, persistent, setDismissed } = useGettingStarted();
  const titleId = useId();
  const stepsId = useId();
  const completed = guideSteps.filter(step => progress[step.id]).length;
  const nextStep = guideSteps.find(step => !progress[step.id]);
  const open = alwaysOpen || !progress.dismissed;

  return (
    <section className="quick-start" aria-labelledby={titleId} aria-busy={!ready}>
      <div className="quick-start-heading">
        <h2 id={titleId}>Quick start</h2>
        {!alwaysOpen && (
          <div className="quick-start-actions">
            <Link className="text-link" href="/help">Help &amp; tips</Link>
            <button className="quiet-button" type="button" aria-expanded={open} aria-controls={stepsId} disabled={!ready} onClick={() => setDismissed(open)}>
              {open ? "Hide guide" : "Show guide"}
            </button>
          </div>
        )}
      </div>
      <div id={stepsId} className="quick-start-content" hidden={!open}>
        <div className="quick-start-summary">
          <p className="quick-start-count" role="status">{ready ? `${completed} of ${guideSteps.length} complete` : "Loading progress…"}</p>
          <div className="quick-start-progress" aria-hidden="true"><span style={{ width: `${completed / guideSteps.length * 100}%` }} /></div>
          <p>{nextStep?.instruction ?? "You’ve finished the guide."}</p>
          {!persistent && <p role="status">Progress is saved for this visit only.</p>}
        </div>
        <ol className="quick-start-steps" role="list">
          {guideSteps.map(step => (
            <li key={step.id}>
              <Link href={step.href} aria-current={step.id === nextStep?.id ? "step" : undefined}>
                <span className="quick-start-check" aria-hidden="true">{progress[step.id] ? "✓" : ""}</span>
                <span>{step.title}{progress[step.id] && <span className="sr-only">(complete)</span>}</span>
                <span className="quick-start-arrow" aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
