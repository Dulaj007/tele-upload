import Footer from "@/components/Footer";
import Nav from "@/components/Nav";
import Legal from "@/components/Legal";

export const metadata = { title: "Privacy policy — Tele Upload" };

export default function PrivacyPage() {
  return (
    <>
      <Nav />
      <Legal title="Privacy policy" updated="Draft — replace before any public launch">
        <h2>Placeholder notice</h2>
        <p>
          Scaffolding, not legal advice. It is accurate about what the software actually
          does, which is the useful part; the legal framing still needs a professional.
        </p>

        <h2>What is collected</h2>
        <ul>
          <li>Your Telegram numeric ID and username, captured once at signup.</li>
          <li>A password hash. The password itself is never stored.</li>
          <li>File metadata: names, sizes, types, upload times, download counts.</li>
          <li>Session tokens, and IP-derived counters used only for rate limiting.</li>
          <li>For recipients: a Telegram ID and the time terms were acknowledged.</li>
        </ul>

        <h2>What is not collected</h2>
        <p>
          File contents. Tele Upload never downloads or stores the bytes of any file — it holds
          a Telegram message ID and asks Telegram to deliver. Your files are subject to
          Telegram&rsquo;s own privacy policy, which is a separate document you should read.
        </p>

        <h2>Third parties</h2>
        <p>
          Telegram receives and stores every file, along with the delivery metadata that
          entails. Nothing here changes that relationship or shields it.
        </p>

        <h2>Retention and deletion</h2>
        <p>
          Delivered files are removed from recipient chats after ten minutes. Deleting a
          file from your dashboard removes it from the index; the underlying Telegram
          message may persist. Ask for account deletion and both the index rows and the
          channel messages go.
        </p>
      </Legal>
      <Footer />
    </>
  );
}
