"use client";

import { InlineSignIn } from "@/components/account/inline-sign-in";

/** The optional sign-in shown when a guest opens a private project version link. */
export function PrivateVersionSignIn({
  onCancel,
  onSignedIn,
  sessionNotice,
}: Readonly<{
  onCancel: () => void;
  onSignedIn: () => void;
  sessionNotice?: string;
}>) {
  return (
    <InlineSignIn
      idPrefix="project-version"
      headingLevel="h3"
      titles={{
        login: "Sign in to open this private project version",
        register: "Create an account",
      }}
      reason={
        <p>
          Only the project owner&apos;s account can open a private project
          version. If it isn&apos;t yours, ask its owner for a read-only share
          link. Your own design stays in this browser either way.
        </p>
      }
      submitLabels={{ login: "Sign in and open", register: "Create account" }}
      sessionNotice={sessionNotice}
      cancelLabel="Continue with my configuration"
      onCancel={onCancel}
      onSignedIn={onSignedIn}
    />
  );
}
