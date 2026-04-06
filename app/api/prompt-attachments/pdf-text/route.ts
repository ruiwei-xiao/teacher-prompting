import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { PDFParse } from "pdf-parse";

export const runtime = "nodejs";

const MAX_PDF_BYTES = 15 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const name = file.name.toLowerCase();
  const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
  if (!isPdf) {
    return NextResponse.json({ error: "PDF files only" }, { status: 400 });
  }

  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json(
      { error: "PDF must be about 15MB or smaller." },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    const text = (result.text || "").trim();
    return NextResponse.json({ text });
  } catch {
    return NextResponse.json(
      { error: "Could not read that PDF." },
      { status: 422 }
    );
  } finally {
    await parser.destroy();
  }
}
