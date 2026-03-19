import { openai } from "@/lib/openai";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    const mp3 = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "marin",
      input: text,
      instructions: "Speak like an elegant futuristic AI assistant. Warm, clever, calm.",
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());

    return new Response(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Speech unavailable", { status: 500 });
  }
}