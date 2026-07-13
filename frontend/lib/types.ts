export type User = {
  id: string;
  name: string;
  email: string;
  role: "student" | "staff";
};

export type FileInfo = {
  id: string;
  project_id: string | null;
  filename: string;
  size: number;
  mime_type: string;
  status: "pending" | "ready";
  kind: "media" | "attachment" | "thumb";
};

export type ProjectListItem = {
  id: string;
  title: string;
  description: string | null;
  is_public: boolean;
  cover_file_id: string | null;
  cover_thumb_file_id: string | null;
  featured_rank: number | null;
  slider_pinned: boolean;
  owner_id: string;
  owner_name: string;
  created_at: string;
};

export type ProjectDetail = ProjectListItem & {
  content: TipTapDoc | null;
  files: FileInfo[];
};

export type TipTapDoc = { type: "doc"; content?: TipTapNode[] };

export type TipTapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
  content?: TipTapNode[];
};

export type Profile = {
  id: string;
  name: string;
  role: "student" | "staff";
  bio: string | null;
  program: string | null;
  enrollment_year: number | null;
  avatar_file_id: string | null;
  projects: ProjectListItem[];
};

export type ProjectPage = { items: ProjectListItem[]; total: number };

export type UploadSlot = {
  file: FileInfo;
  upload_url: string;
  upload_fields: Record<string, string>;
};

export type Machine = {
  slug: string;
  name: string;
  category: string;
  status: "available" | "in_use" | "maintenance" | "offline";
  training_required: boolean;
  notes: string;
};

export type Booking = {
  id: string;
  machine_slug: string;
  date: string;
  start_time: string;
  end_time: string;
  purpose: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  created_at: string;
};

export type AdminBooking = Booking & { user_name: string; user_email: string };

export type BookingRules = {
  slot_minutes: number;
  max_minutes: number;
  advance_days: number;
  lab_open: string;
  lab_close: string;
};

export type DaySlot = { start_time: string; end_time: string };

export type Checkout = {
  id: string;
  category: string;
  tool_name: string;
  quantity: number;
  due_date: string;
  status: "out" | "returned";
  returned_at: string | null;
  created_at: string;
};

export type AdminCheckout = Checkout & {
  user_name: string;
  user_email: string;
  overdue: boolean;
};

export type Issue = {
  id: string;
  machine_slug: string | null;
  type: "equipment" | "safety" | "other";
  severity: "low" | "medium" | "high" | "urgent";
  description: string;
  status: "open" | "resolved";
  created_at: string;
};

export type AdminIssue = Issue & {
  reporter_name: string;
  reporter_email: string;
};

export type DownloadUrl = {
  url: string;
  filename: string;
  size: number;
  mime_type: string;
};
