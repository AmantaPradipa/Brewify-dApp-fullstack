import { NextRequest, NextResponse } from "next/server";
import { pinata } from "@/utils/config";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();

    const result = await pinata.upload.public.json(json);
    const url = await pinata.gateways.public.convert(result.cid);

    return NextResponse.json({ cid: result.cid, url }, { status: 200 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Metadata upload failed" }, { status: 500 });
  }
}

