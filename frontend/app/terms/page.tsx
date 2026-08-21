import Footer from "@/components/Footer";
import Nav from "@/components/Nav";
import Legal from "@/components/Legal";

export const metadata = { title: "Terms of service — Tele Upload" };

export default function TermsPage() {
  return (
    <>
      <Nav />
      <Legal title="Terms of service" updated="Draft — replace before any public launch">
        <h2>Placeholder notice</h2>
        <p>
          This text is scaffolding written by a developer, not a lawyer. Both bots link
          here during onboarding, so real terms need to exist before anyone outside your
          own circle uses this. What is below is a checklist of what those terms have to
          cover, not the terms themselves.
        </p>

        <h2>Accounts</h2>
        <p>
          Your account is tied to a Telegram account. Your handle is derived from Telegram
          at signup and cannot be changed. You are responsible for everything done through
          your account.
        </p>

        <h2>What you may upload</h2>
        <p>
          Only files you own or have permission to distribute. Prohibited without exception:
          material that infringes copyright, intimate images shared without the subject&rsquo;s
          consent, any content involving minors, malware, and anything unlawful where you
          or the recipient are located.
        </p>

        <h2>Removal</h2>
        <p>
          Files may be removed and accounts suspended at any time, including on receipt of
          a rights-holder complaint, with no obligation to restore them. Include a working
          contact address for takedown notices here.
        </p>

        <h2>Availability</h2>
        <p>
          Tele Upload stores files on Telegram, a platform it does not control. Service may stop
          without warning and stored files may become unreachable. No availability guarantee
          is offered or implied. Keep your own copies.
        </p>

        <h2>Age and jurisdiction</h2>
        <p>
          If this service will ever host adult material, age-verification obligations apply
          in the UK, the EU and a growing number of US states. Those obligations attach to
          you as the operator regardless of where the files are stored. Get advice before
          launching publicly.
        </p>
      </Legal>
      <Footer />
    </>
  );
}
