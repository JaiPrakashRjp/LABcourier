"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { Button, EmptyState, LinkButton } from "@/components/ui";

/** Last-resort screen for crashes outside the signed-in area (home, login, sign-up). */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-5">
      <div className="w-full">
        <EmptyState
          icon={<TriangleAlert className="h-7 w-7 text-rose-600" />}
          title="Something went wrong"
          action={
            <div className="flex gap-2">
              <LinkButton href="/" variant="secondary">Go home</LinkButton>
              <Button onClick={reset}><RefreshCw className="h-4 w-4" /> Try again</Button>
            </div>
          }
        >
          This page ran into a problem. Please try again. If it keeps happening, refresh the browser.
        </EmptyState>
      </div>
    </main>
  );
}
