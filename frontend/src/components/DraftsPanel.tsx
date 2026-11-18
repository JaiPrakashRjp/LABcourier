"use client";

import { ArrowRight, FilePen, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { dateOnly } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { Button, Card, LinkButton, Modal } from "./ui";

interface Draft {
  id: number;
  lab_name: string;
  contents: string;
  weight_g: number;
  status: string;
  total_count: number;
  recipients: string[];
  created_at: string;
}

/** Packages that were saved but never booked: continue them or delete them. */
export function DraftsPanel() {
  const { data, reload } = useApi<Draft[]>("/batches/drafts");
  const [deleting, setDeleting] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  if (!data || data.length === 0) return null;

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/batches/${deleting.id}`, { method: "DELETE" });
      toast.success("Draft deleted");
      setDeleting(null);
      void reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const names = (d: Draft) =>
    d.recipients.slice(0, 3).join(", ") + (d.recipients.length > 3 ? ` +${d.recipients.length - 3} more` : "");

  return (
    <Card className="mb-5 p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <FilePen className="h-4 w-4 text-amber-600" />
        <h2 className="text-sm font-bold text-neutral-900">Not booked yet</h2>
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">{data.length}</span>
      </div>
      <ul className="divide-y divide-neutral-100">
        {data.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-neutral-900">
                {d.lab_name} <span className="font-normal text-neutral-400">→</span> {names(d)}
              </p>
              <p className="text-xs text-neutral-500">
                {d.contents} · {d.weight_g} g · {d.total_count} recipient{d.total_count === 1 ? "" : "s"} · saved {dateOnly(d.created_at)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => setDeleting(d)}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
              <LinkButton href={`/packages/new?batch=${d.id}`} size="sm">
                Continue <ArrowRight className="h-4 w-4" />
              </LinkButton>
            </div>
          </li>
        ))}
      </ul>

      <Modal
        open={!!deleting}
        title="Delete this draft?"
        description="It was never booked, so nothing is sent to any courier."
        onClose={() => !busy && setDeleting(null)}
      >
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
          <Button variant="secondary" onClick={() => setDeleting(null)} disabled={busy}>Cancel</Button>
          <Button variant="danger" onClick={() => void remove()} loading={busy}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
