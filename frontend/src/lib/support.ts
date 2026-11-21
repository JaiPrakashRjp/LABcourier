/**
 * Courier helpline shown in the side menu. Tapping it opens the phone's dialer.
 * Change it here, or set NEXT_PUBLIC_COURIER_HELPLINE (digits, with or without +91) before building.
 */
const RAW = process.env.NEXT_PUBLIC_COURIER_HELPLINE || "08068172518";

const digits = RAW.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "").replace(/^0/, "");

/** For tel: links, e.g. "+918068172518". */
export const HELPLINE_TEL = `+91${digits}`;

/** For display, e.g. "080-6817 2518". */
export const HELPLINE_TEXT = digits.length === 10 ? `0${digits.slice(0, 2)}-${digits.slice(2, 6)} ${digits.slice(6)}` : RAW;
