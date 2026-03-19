import { createClient } from "@/lib/supabase/server";

export async function getRelevantMemories(userId: string, query: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("memories")
    .select("id, content, kind, relevance_score, created_at")
    .eq("user_id", userId)
    .order("relevance_score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(8);

  if (error || !data) return [];

  const q = query.toLowerCase();
  return data.filter((m) => m.content.toLowerCase().includes(q) || m.kind === "preference");
}