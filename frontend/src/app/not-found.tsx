import { SearchX } from "lucide-react";
import { EmptyState, LinkButton } from "@/components/ui";

/** Shown for addresses that don't exist. */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-5">
      <div className="w-full">
        <EmptyState
          icon={<SearchX className="h-7 w-7" />}
          title="Page not found"
          action={<LinkButton href="/dashboard">Go to dashboard</LinkButton>}
        >
          The page you&apos;re looking for doesn&apos;t exist or has moved. Check the address, or go back to the dashboard.
        </EmptyState>
      </div>
    </main>
  );
}
