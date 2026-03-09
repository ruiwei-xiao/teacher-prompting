import { NextRequest, NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { getUserByEmail } from "@/lib/auth/user-store";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      email?: string;
      password?: string;
    };

    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!email || !password) {
      return NextResponse.json(
        { error: "Please enter both email and password." },
        { status: 400 }
      );
    }

    const user = await getUserByEmail(email);
    if (!user) {
      return NextResponse.json(
        { error: "No account found for this email." },
        { status: 404 }
      );
    }

    if (!user.passwordHash) {
      return NextResponse.json(
        {
          error:
            "This account uses social sign-in. Use Google or Microsoft instead.",
        },
        { status: 400 }
      );
    }

    const matches = await compare(password, user.passwordHash);
    if (!matches) {
      return NextResponse.json(
        { error: "Incorrect password." },
        { status: 401 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unable to validate credentials." },
      { status: 500 }
    );
  }
}
