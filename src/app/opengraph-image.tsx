import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

// The picture shown when someone shares the site in a text or group chat.
export const alt = "League of Dreams — fantasy baseball since 2007";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const [badge, oswald] = await Promise.all([
    readFile(path.join(process.cwd(), "public", "league-badge.png")),
    readFile(path.join(process.cwd(), "src", "app", "fonts", "Oswald-Bold.woff")), // OFL-licensed
  ]);
  const src = `data:image/png;base64,${badge.toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#070c1f", position: "relative" }}>
        <div style={{ position: "absolute", right: -120, top: 0, width: 420, height: 630, background: "#e31937", transform: "skewX(-18deg)" }} />
        <div style={{ position: "absolute", left: 0, bottom: 0, width: 1200, height: 18, background: "#e31937" }} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 80px", width: 900 }}>
          <img src={src} width={248} height={122} style={{ borderRadius: 14, marginBottom: 36 }} alt="" />
          <div style={{ fontFamily: "Oswald", fontSize: 150, color: "#f4f6fb", lineHeight: 0.9, textTransform: "uppercase" }}>
            League of Dreams
          </div>
          <div style={{ fontSize: 36, color: "#9aa6c8", marginTop: 28 }}>Live scores · Standings · 20 years of history</div>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Oswald", data: oswald, weight: 700, style: "normal" }] },
  );
}
