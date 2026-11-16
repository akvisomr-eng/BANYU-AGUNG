import { auth } from "@/lib/auth/server";

// The installed Neon Auth SDK exposes loginUrl in its middleware options.
// Protect only the ERP workspace; the public marketing site stays public.
export default auth.middleware({
  loginUrl: "/auth/sign-in",
});

export const config = {
  matcher: ["/workspace/:path*"],
};
