import { openai } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import { buildSystemPrompt } from "@/lib/prompts";
import { getRelevantMemories } from "@/lib/memory";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { chatId, message } = await req.json();

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    // 🧠 SMART MEMORY (context-aware)
    const memories = await getRelevantMemories(user.id, message);

    const systemPrompt = buildSystemPrompt(
      memories.map((m) => m.content)
    );

    // 📜 LOAD CHAT HISTORY
    const { data: priorMessages } = await supabase
      .from("messages")
      .select("role, content")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true })
      .limit(30);

    const input = [
      {
        role: "system",
        content: systemPrompt,
      },
      ...(priorMessages ?? []).map((m) => ({
        role: m.role,
        content: m.content,
      })),
      {
        role: "user",
        content: message,
      },
    ];

    // 💾 SAVE USER MESSAGE
    await supabase.from("messages").insert({
      chat_id: chatId,
      user_id: user.id,
      role: "user",
      content: message,
    });

    // ⚡ STREAM RESPONSE
    const encoder = new TextEncoder();
    let fullText = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const response = await openai.responses.create({
            model: "gpt-5-mini",
            input,
            stream: true,
          });

          for await (const event of response) {
            if (event.type === "response.output_text.delta") {
              const delta = event.delta || "";
              fullText += delta;

              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "delta", delta })}\n\n`
                )
              );
            }

            if (event.type === "response.completed") {
              // 💾 SAVE AI RESPONSE
              await supabase.from("messages").insert({
                chat_id: chatId,
                user_id: user.id,
                role: "assistant",
                content: fullText,
              });

              // 🧠 AUTO MEMORY (SMART FILTER)
              if (
                message.toLowerCase().includes("i like") ||
                message.toLowerCase().includes("my favorite") ||
                message.toLowerCase().includes("i am") ||
                message.toLowerCase().includes("i love")
              ) {
                await supabase.from("memories").insert({
                  user_id: user.id,
                  content: message,
                });
              }

              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "done" })}\n\n`
                )
              );

              controller.close();
            }
          }
        } catch {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                message: "The Arcadian Archive glitched for a second.",
              })}\n\n`
            )
          );

          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch {
    return new Response("Bad request", { status: 400 });
  }
}