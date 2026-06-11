import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { updateCompanySchema } from "@/lib/validators/company";
import {
  getCompany,
  updateCompany,
  deleteCompanies,
  DuplicateCompanyError,
} from "@/lib/services/companies";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const company = await getCompany(id);
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data: company });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateCompanySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.flatten() },
      { status: 422 }
    );
  }

  try {
    const company = await updateCompany(id, parsed.data);
    return NextResponse.json({ data: company });
  } catch (err) {
    if (err instanceof DuplicateCompanyError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await deleteCompanies([id]);
  return NextResponse.json({ data: { deleted: true } });
}
