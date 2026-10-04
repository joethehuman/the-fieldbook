import "server-only";
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { InstallationOgCard } from "../lib/og-card-template";
import { ogCardSize, type OgCardIdentity } from "../lib/og-card";

export async function installationOgImage(identity: OgCardIdentity) {
  const [regular, medium] = await Promise.all([
    readFile(
      path.join(
        process.cwd(),
        "node_modules/geist/dist/fonts/geist-sans/Geist-Regular.ttf",
      ),
    ),
    readFile(
      path.join(
        process.cwd(),
        "node_modules/geist/dist/fonts/geist-sans/Geist-Medium.ttf",
      ),
    ),
  ]);
  return new ImageResponse(<InstallationOgCard identity={identity} />, {
    ...ogCardSize,
    fonts: [
      {
        name: "Geist",
        data: regular.buffer.slice(
          regular.byteOffset,
          regular.byteOffset + regular.byteLength,
        ) as ArrayBuffer,
        weight: 400,
        style: "normal",
      },
      {
        name: "Geist",
        data: medium.buffer.slice(
          medium.byteOffset,
          medium.byteOffset + medium.byteLength,
        ) as ArrayBuffer,
        weight: 500,
        style: "normal",
      },
    ],
    headers: { "Cache-Control": "no-store" },
  });
}
