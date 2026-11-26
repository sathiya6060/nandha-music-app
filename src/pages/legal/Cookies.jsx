import LegalPage from './LegalPage.jsx'

/**
 * Cookie Policy — honest: the app uses browser local storage for essentials
 * and sets no marketing cookies. Declining changes nothing about how the
 * app works.
 */
export default function Cookies() {
  return (
    <LegalPage
      title="Cookie Policy"
      updated="Last updated: 26 November 2026"
      tamilSummary="இந்தச் செயலி விளம்பர குக்கீகளைப் பயன்படுத்துவதில்லை. உங்கள் உள்நுழைவு, விருப்பங்கள், மொழி போன்ற அத்தியாவசியத் தகவல்கள் மட்டுமே உங்கள் உலாவியில் சேமிக்கப்படும். நீங்கள் மறுத்தாலும் செயலி முழுமையாக இயங்கும்."
    >
      <h2>What we use</h2>
      <p>
        We use your browser&apos;s local storage — not tracking cookies — for
        things the app needs to work:
      </p>
      <ul>
        <li>
          <strong>Your consent choice</strong> (<code>nandha-consent</code>):
          whether you accepted or declined cookies, so we do not ask again.
        </li>
        <li>
          <strong>Sign-in session</strong> (Supabase): keeps you signed in
          between visits, only when you create an account and sign in.
        </li>
        <li>
          <strong>Your preferences:</strong> language, liked songs, queue,
          volume and playback quality.
        </li>
      </ul>

      <h2>What we do not use</h2>
      <p>
        No advertising cookies, no marketing cookies, no third-party
        analytics beacons and no social-media trackers. Nothing on this site
        follows you to other websites.
      </p>

      <h2>Your choice</h2>
      <p>
        When you first visit, a banner asks you to accept or decline. Either
        choice is fine — declining changes nothing about how the app works,
        because there are no optional or marketing cookies to switch off. You
        can clear everything the app stored at any time from your
        browser&apos;s settings (clear site data for this site), and you can
        sign out to end your session.
      </p>

      <h2>Third-party cookies</h2>
      <p>
        We set no third-party cookies ourselves. Our hosting provider
        (Cloudflare) and authentication provider (Supabase) may set essential
        technical cookies needed to serve the site securely and keep you
        signed in; those are covered by their own privacy policies.
      </p>
    </LegalPage>
  )
}
