export { default } from "next-auth/middleware"

export const config = {
  matcher: ["/((?!api/auth|api/webhooks|api/health|login|privacy|terms|_next/static|_next/image|favicon.ico).*)"],
}
