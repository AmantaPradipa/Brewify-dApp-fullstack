import { NextRequest, NextResponse } from "next/server";
import { pinata } from "@/utils/config";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const data = await req.formData();
    const file: File | null = data.get("file") as unknown as File;
    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

    const result = await pinata.upload.public.file(file);
    const url = await pinata.gateways.public.convert(result.cid);

    return NextResponse.json({ url }, { status: 200 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
