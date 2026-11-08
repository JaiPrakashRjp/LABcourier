export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  BOOKING: "Booking",
  BOOKED: "Booked",
  BOOKING_FAILED: "Booking failed",
  PICKED_UP: "Picked up",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  DELIVERY_FAILED: "Delivery failed",
  RETURN_REQUESTED: "Return requested",
  RETURNED: "Returned",
  CANCELLED: "Cancelled",
};

// Order used on the dashboard and in filters.
export const STATUS_ORDER = [
  "BOOKED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "DELIVERY_FAILED",
  "RETURN_REQUESTED",
  "RETURNED",
  "CANCELLED",
  "BOOKING_FAILED",
  "BOOKING",
  "DRAFT",
];

// Badges stay neutral; only the dot carries colour, so the page stays black, white and grey.
const BADGE = "bg-white text-neutral-700 ring-neutral-200";
export const STATUS_TONE: Record<string, { badge: string; dot: string }> = {
  DRAFT: { badge: BADGE, dot: "bg-neutral-300" },
  BOOKING: { badge: BADGE, dot: "bg-sky-500 animate-pulse" },
  BOOKED: { badge: BADGE, dot: "bg-brand-500" },
  BOOKING_FAILED: { badge: "bg-white text-rose-700 ring-rose-200", dot: "bg-rose-500" },
  PICKED_UP: { badge: BADGE, dot: "bg-violet-500" },
  IN_TRANSIT: { badge: BADGE, dot: "bg-sky-500" },
  OUT_FOR_DELIVERY: { badge: BADGE, dot: "bg-amber-500" },
  DELIVERED: { badge: BADGE, dot: "bg-emerald-500" },
  DELIVERY_FAILED: { badge: "bg-white text-orange-700 ring-orange-200", dot: "bg-orange-500" },
  RETURN_REQUESTED: { badge: BADGE, dot: "bg-pink-500" },
  RETURNED: { badge: BADGE, dot: "bg-fuchsia-500" },
  CANCELLED: { badge: "bg-neutral-50 text-neutral-500 ring-neutral-200", dot: "bg-neutral-400" },
};

// Chart colours, matching the badge dots.
export const STATUS_FILL: Record<string, string> = {
  BOOKED: "#0d9488",
  PICKED_UP: "#8b5cf6",
  IN_TRANSIT: "#0ea5e9",
  OUT_FOR_DELIVERY: "#f59e0b",
  DELIVERED: "#10b981",
  DELIVERY_FAILED: "#f97316",
  RETURN_REQUESTED: "#ec4899",
  RETURNED: "#d946ef",
  CANCELLED: "#94a3b8",
  BOOKING_FAILED: "#f43f5e",
  BOOKING: "#38bdf8",
  DRAFT: "#cbd5e1",
};

const rupee = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export function money(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : rupee.format(value);
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export function dateOnly(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", { dateStyle: "medium" });
}
