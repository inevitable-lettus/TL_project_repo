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

export type DownloadUrl = {
  url: string;
  filename: string;
  size: number;
  mime_type: string;
};
