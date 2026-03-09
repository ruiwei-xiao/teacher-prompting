import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { registerUser } from "@/auth";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      email?: string;
      password?: string;
      name?: string;
    };

    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const name = String(body.name || "").trim();

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    const passwordHash = await hash(password, 10);
    const user = await registerUser({
      email,
      passwordHash,
      name: name || undefined,
    });

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to create account." },
      { status: 500 }
    );
  }
}
