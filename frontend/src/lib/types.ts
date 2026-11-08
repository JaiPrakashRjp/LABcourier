export const ROLES = { DOCTOR: 1, EXECUTIVE: 2, ADMIN: 3 } as const;
export type RoleId = (typeof ROLES)[keyof typeof ROLES];

export interface User {
  id: number;
  name: string;
  phone: string;
  role_id: RoleId;
  role_name: string;
  company_id: number;
  company_name: string;
}

export interface Session {
  access_token: string;
  expires_in: number;
  /** ISO time when the user is signed out automatically (24 hours after sign-in). */
  session_expires_at: string;
  user: User;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface State {
  id: number;
  name: string;
}

export interface City {
  id: number;
  name: string;
  state_id: number;
}

export interface PincodeInfo {
  pincode: string;
  city_id: number;
  city_name: string;
  state_id: number;
  state_name: string;
}

export interface Person {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  address_line1: string;
  address_line2: string | null;
  pincode: string;
  city_id: number;
  city_name: string;
  state_id: number;
  state_name: string;
  detail: string | null;
}

export type PersonKind = "dentists" | "executives" | "labs";

export interface Courier {
  id: number;
  code: string;
  name: string;
  supports_cancel: boolean;
}

export interface Shipment {
  id: number;
  batch_id: number | null;
  direction: "FORWARD" | "RETURN";
  parent_shipment_id: number | null;
  recipient_type: "DENTIST" | "EXECUTIVE" | "LAB";
  recipient_name: string;
  recipient_phone: string;
  to_city: string;
  to_pincode: string;
  from_name: string;
  lab_id: number;
  provider_id: number | null;
  provider_name: string | null;
  tracking_number: string | null;
  status: string;
  courier_status_raw: string | null;
  final_price: number | null;
  quoted_price: number | null;
  booking_error: string | null;
  has_label: boolean;
  expected_delivery_date: string | null;
  booked_at: string | null;
  delivered_at: string | null;
  created_at: string;
  can_cancel: boolean;
  can_return: boolean;
}

export interface Address {
  name: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  company?: string | null;
}

export interface ShipmentEvent {
  status: string;
  description: string | null;
  location: string | null;
  event_at: string;
  source: string;
}

export interface ReturnRequest {
  id: number;
  reason: string;
  notes: string | null;
  status: string;
  error: string | null;
  return_shipment_id: number | null;
  photo_count: number;
  created_at: string;
}

export interface ShipmentDetail extends Shipment {
  from_address: Address;
  to_address: Address;
  weight_g: number;
  service_type: string | null;
  events: ShipmentEvent[];
  returns: ReturnRequest[];
  related: Shipment[];
}

export interface Batch {
  id: number;
  lab_id: number;
  lab_name: string;
  weight_g: number;
  length_cm: number | null;
  breadth_cm: number | null;
  height_cm: number | null;
  contents: string;
  declared_value: number;
  payment_mode: "PREPAID" | "COD";
  cod_amount: number;
  status: "DRAFT" | "QUOTED" | "BOOKING" | "COMPLETED" | "PARTIAL";
  total_count: number;
  booked_count: number;
  failed_count: number;
  has_labels: boolean;
  created_at: string;
  shipments: Shipment[];
}

export interface Quote {
  provider_id: number;
  provider_name: string;
  serviceable: boolean;
  service_type: string | null;
  price: number | null;
  tax: number | null;
  total: number | null;
  estimated_days: number | null;
  message: string | null;
}

export interface RecipientQuotes {
  shipment_id: number;
  recipient_name: string;
  recipient_type: string;
  pincode: string;
  city: string;
  quotes: Quote[];
}

export interface CourierOption {
  provider_id: number;
  provider_name: string;
  serviceable_count: number;
  unserviceable_count: number;
  total: number;
  cheapest: boolean;
}

export interface BatchQuotes {
  batch_id: number;
  recipients: RecipientQuotes[];
  options: CourierOption[];
}

export interface Dashboard {
  date_from: string;
  date_to: string;
  bucket: "day" | "week" | "month";
  total: number;
  status_counts: Record<string, number>;
  trend: { period: string; counts: Record<string, number> }[];
  by_provider: { provider_id: number; provider_name: string; count: number; spend: number }[];
}
