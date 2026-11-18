"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { Button, EmptyState, LinkButton } from "@/components/ui";

/** Shown inside the app layout when a page crashes, so the sidebar stays usable. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div className="py-10">
      <EmptyState
        icon={<TriangleAlert className="h-7 w-7 text-rose-600" />}
        title="This page didn't load properly"
        action={
          <div className="flex gap-2">
            <LinkButton href="/dashboard" variant="secondary">Go to dashboard</LinkButton>
            <Button onClick={reset}><RefreshCw className="h-4 w-4" /> Try again</Button>
          </div>
        }
      >
        Something went wrong while showing this page. Your data is safe. Try again, and if it keeps happening, refresh the browser.
      </EmptyState>
    </div>
  );
}
