import { getLearningStore } from "@/lib/server/learning-service";
import { getAudioStore } from "@/lib/server/audio-service";
import { audioByteRange } from "@/lib/server/audio-range";
import {
  RequestError,
  json,
  requireLocalRequest,
} from "@/lib/server/local-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ clipId: string }> };
async function serve(request: Request, context: Context, head = false) {
  try {
    requireLocalRequest(request);
    const { clipId } = await context.params;
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(clipId))
      throw new RequestError("Ce son est introuvable.", 404);
    const result = getAudioStore().getClip(
      getLearningStore().getLocalUserId(),
      clipId,
    );
    if (!result) throw new RequestError("Ce son est introuvable.", 404);
    const { clip, bytes } = result;
    const range = audioByteRange(
      request.headers.get("range"),
      bytes.byteLength,
    );
    const headers = {
      "Content-Type": clip.mimeType,
      "Cache-Control": "private, no-store",
      Vary: "Origin",
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
    };
    if (range === "invalid")
      return new Response(null, {
        status: 416,
        headers: { ...headers, "Content-Range": `bytes */${bytes.byteLength}` },
      });
    const start = range?.start ?? 0;
    const end = range?.end ?? bytes.byteLength - 1;
    return new Response(
      head ? null : new Uint8Array(bytes.slice(start, end + 1)),
      {
        status: range ? 206 : 200,
        headers: {
          ...headers,
          "Content-Length": String(end - start + 1),
          ...(range
            ? { "Content-Range": `bytes ${start}-${end}/${bytes.byteLength}` }
            : {}),
        },
      },
    );
  } catch (error) {
    if (error instanceof RequestError)
      return json({ message: error.message }, error.status);
    return json(
      { message: "Le son est indisponible. Réessaie dans un instant." },
      503,
    );
  }
}
export async function GET(request: Request, context: Context) {
  return serve(request, context);
}
export async function HEAD(request: Request, context: Context) {
  return serve(request, context, true);
}
