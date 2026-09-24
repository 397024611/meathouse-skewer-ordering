import { NextResponse } from "next/server";

export function middleware(request) {
  const host = (request.headers.get("host") || "").split(":")[0].toLowerCase();

  if (host === "report.baogaolaoban.com" && request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/report/index.html";
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
