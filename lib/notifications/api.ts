import { createClient } from "@/lib/supabase/client";

export type NotificationType =
  | "session_requested"
  | "session_accepted"
  | "session_rejected"
  | "incoming_call"
  | "feedback_received";

export type NotificationRow = {
  id: string;
  user_id: string;
  type: NotificationType;
  payload: { message: string; sessionId?: string };
  read: boolean;
  created_at: string;
};

export async function createNotification(userId: string, type: NotificationType, message: string, sessionId: string) {
  const supabase = createClient();
  return supabase.from("notifications").insert({
    user_id: userId,
    type,
    payload: { message, sessionId },
  });
}

export async function listNotifications() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: [] as NotificationRow[], error: null };
  return supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30) as unknown as Promise<{ data: NotificationRow[]; error: any }>;
}

export async function markAllRead(ids: string[]) {
  if (ids.length === 0) return;
  const supabase = createClient();
  return supabase.from("notifications").update({ read: true }).in("id", ids);
}
