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

export type DownloadUrl = {
  url: string;
  filename: string;
  size: number;
  mime_type: string;
};

export type LoanType = "equipment" | "material";

export type LoanStatus = "used" | "out" | "overdue" | "returned";

export type Loan = {
  id: string;
  type: LoanType;
  item_name: string;
  description: string;
  quantity: number;
  unit: string;
  project: { id: string; title: string } | null;
  due_date: string | null;
  borrowed_at: string;
  returned_at: string | null;
  returned_by_id: string | null;
  return_note: string | null;
  status: LoanStatus;
  borrow_photo_ids: string[];
  return_photo_id: string | null;
};

// Staff view of a loan (GET /admin/loans): who borrowed it, who returned it,
// and every photo with its stage.
export type PersonRef = { id: string; name: string; email: string };

export type AdminLoan = {
  id: string;
  type: LoanType;
  item_name: string;
  description: string;
  quantity: number;
  unit: string;
  borrower: PersonRef;
  project: { id: string; title: string } | null;
  due_date: string | null;
  borrowed_at: string;
  returned_at: string | null;
  returned_by: PersonRef | null;
  return_note: string | null;
  status: LoanStatus;
  photos: { file_id: string; stage: "borrow" | "return"; position: number }[];
};

export type AdminLoanPage = { items: AdminLoan[]; total: number };

// Query filters shared by the admin list and the CSV export. Empty = no filter.
export type LoanFilters = {
  status: LoanStatus | "";
  type: LoanType | "";
  q: string;
  from: string;
  to: string;
};

export type LoanRules = {
  max_days: number;
  max_photos: number;
  units: string[];
};
