import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const { content, kind = "preference" } = await req.json();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return new Response("Unauthorized", { status: 401 });

  const { error } = await supabase.from("memories").insert({
    user_id: user.id,
    content,
    kind,
  });

  if (error) return new Response(error.message, { status: 500 });
  return Response.json({ ok: true });
}