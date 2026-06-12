export { default } from "next-auth/middleware"

export const config = {
  matcher: ["/((?!api/auth|api/webhooks|api/health|login|_next/static|_next/image|favicon.ico).*)"],
}
