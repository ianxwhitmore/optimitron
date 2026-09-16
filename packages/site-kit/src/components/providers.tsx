"use client";

import { SessionContext, SessionProvider } from "next-auth/react";
import { useContext } from "react";
import type { Session } from "next-auth";
import { getSiteConfig } from "../lib/site-config";

interface ProvidersProps {
  children: React.ReactNode;
  session?: Session | null;
  authEnabled?: boolean;
}

export function Providers({
  children,
  session,
  authEnabled = true,
}: ProvidersProps) {
  return (
    <SessionProvider
      session={authEnabled ? session : null}
      refetchOnWindowFocus={authEnabled}
      refetchInterval={0}
    >
      {children}
    </SessionProvider>
  );
}

/** Next.js can render the not-found page without the root layout. */
export function SessionBoundary({ children }: { children: React.ReactNode }) {
  const session = useContext(SessionContext);

  return session ? children : (
    <Providers authEnabled={getSiteConfig().authEnabled !== false}>
      {children}
    </Providers>
  );
}
