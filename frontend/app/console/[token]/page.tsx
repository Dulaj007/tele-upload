import { notFound } from "next/navigation";
import LoginForm from "./LoginForm";

/*
  The admin login. `params.token` is checked here, server-side, against
  ADMIN_PATH_TOKEN -- a plain env var, never NEXT_PUBLIC_, so it never
  reaches client JS. A mismatch calls notFound(), which renders and
  responds exactly like a real 404: nothing here hints that an admin login
  exists at all. The real security is the login form's credentials and the
  session that follows, not this path -- this is just about not being
  indexed or stumbled on.
*/

export const metadata = {
  robots: { index: false, follow: false },
};

export default function ConsoleLoginPage({ params }: { params: { token: string } }) {
  if (!process.env.ADMIN_PATH_TOKEN || params.token !== process.env.ADMIN_PATH_TOKEN) {
    notFound();
  }
  return <LoginForm />;
}
