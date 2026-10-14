import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { api, ApiError } from "@/lib/api";

// The link staff click in the Sheet. Nothing renders: resolve the short-lived
// presigned URL with the viewer's own session, then bounce to it.
export default async function LoanPhotoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  // The backend answers 404, not 401, to an anonymous file request, so a
  // signed-out visitor (e.g. staff with an expired session) would see "not
  // found". Send them to log in before asking.
  if (!cookieStore.has("session")) redirect("/api/auth/login");
  const cookie = cookieStore.toString();
  let url: string;
  try {
    url = (await api.downloadUrl(id, cookie)).url;
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect("/api/auth/login");
      if ([404, 422].includes(error.status)) notFound();
    }
    throw error;
  }
  redirect(url);
}
