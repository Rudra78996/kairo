import { NextResponse } from "next/server";

export const runtime = "nodejs";

function validYouTubeUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 500) return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (hostname !== "youtu.be" && hostname !== "youtube.com" && !hostname.endsWith(".youtube.com")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const youtubeUrl = validYouTubeUrl(new URL(request.url).searchParams.get("url"));
  if (!youtubeUrl) return NextResponse.json({ message: "Invalid YouTube URL." }, { status: 400 });

  try {
    const endpoint = new URL("https://www.youtube.com/oembed");
    endpoint.searchParams.set("url", youtubeUrl);
    endpoint.searchParams.set("format", "json");
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(7000), next: { revalidate: 86400 } });
    if (!response.ok) return NextResponse.json({ message: "YouTube metadata is unavailable." }, { status: 422 });
    const metadata = await response.json() as { title?: unknown };
    if (typeof metadata.title !== "string" || !metadata.title.trim()) {
      return NextResponse.json({ message: "YouTube did not return a title." }, { status: 422 });
    }
    return NextResponse.json({ title: metadata.title.trim().slice(0, 160) });
  } catch (error) {
    console.error("Could not resolve YouTube title", error);
    return NextResponse.json({ message: "Could not read the YouTube title." }, { status: 502 });
  }
}
