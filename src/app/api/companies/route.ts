import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  createCompanySchema,
  listCompaniesQuerySchema,
} from "@/lib/validators/company";
import {
  createCompany,
  listCompanies,
  DuplicateCompanyError,
} from "@/lib/services/companies";

// GET /api/companies — list with search / filter / sort / pagination
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = listCompaniesQuerySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", issues: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const data = await listCompanies(parsed.data);
  return NextResponse.json({ data });
}

// POST /api/companies — create one
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createCompanySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.flatten() },
      { status: 422 }
    );
  }

  try {
    const company = await createCompany(parsed.data);
    return NextResponse.json({ data: company }, { status: 201 });
  } catch (err) {
    if (err instanceof DuplicateCompanyError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
