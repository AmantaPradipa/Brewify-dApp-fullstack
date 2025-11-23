import { NextResponse } from "next/server";
import { pinata } from "@/utils/config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const url = await pinata.upload.public.createSignedURL({ expires: 30 });
    return NextResponse.json({ url }, { status: 200 });
  } catch (error) {
    console.log(error);
    return NextResponse.json({ text: "Error creating signed URL" }, { status: 500 });
  }
}
