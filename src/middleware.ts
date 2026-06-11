import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Only the sign-in / sign-up routes are public. Everything else requires login.
const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpg|jpeg|gif|png|svg|ico|webp|woff2?|ttf|otf)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
