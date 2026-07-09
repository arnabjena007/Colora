export const runtime = "nodejs";

interface GenerateTextBody {
  apiKey?: string;
  prompt?: string;
  model?: string;
}

interface GeminiResponseBody {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

export async function POST(request: Request) {
  let body: GenerateTextBody;

  try {
    body = await request.json() as GenerateTextBody;
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const apiKey = body.apiKey?.trim();
  const prompt = body.prompt?.trim();
  const model = body.model?.trim() || "gemini-2.0-flash";

  if (!apiKey) return Response.json({ error: "Missing API key" }, { status: 400 });
  if (!prompt) return Response.json({ error: "Missing prompt" }, { status: 400 });

  let response: Response;
  let data: GeminiResponseBody;

  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
      }),
    });
    data = await response.json() as GeminiResponseBody;
  } catch {
    return Response.json({ error: "Could not reach Gemini" }, { status: 502 });
  }

  if (!response.ok) {
    return Response.json({ error: data.error?.message ?? "AI request failed" }, { status: response.status });
  }

  const text = data.candidates?.[0]?.content?.parts?.map(part => part.text ?? "").join("").trim() ?? "";
  if (!text) {
    return Response.json({ error: "No text returned" }, { status: 502 });
  }

  return Response.json({ text });
}
