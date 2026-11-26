import LegalPage from './LegalPage.jsx'

/**
 * Privacy Policy — real and specific to this app. The app is free, has no
 * advertising trackers, and does not sell data. Accounts are handled by
 * Supabase Auth; hosting is Cloudflare Pages.
 */
export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="Last updated: 26 November 2026"
      tamilSummary="இந்தச் செயலி கணக்குக்காக உங்கள் மின்னஞ்சல் மற்றும் கடவுச்சொல்லை மட்டுமே சேமிக்கிறது. நீங்கள் விரும்பும் பாடல்களும் கேட்கும் வரலாறும் உங்கள் சாதனத்தில் மட்டுமே இருக்கும் — வேறு சாதனத்திற்கு மாறாது. விளம்பர குக்கீகள் இல்லை, உங்கள் தகவல் யாருக்கும் விற்கப்படுவதில்லை. உங்கள் தகவலைப் பார்க்க, திருத்த அல்லது நீக்க விரும்பினால் officialnandhamusic@gmail.com என்ற முகவரிக்கு மின்னஞ்சல் அனுப்புங்கள்."
    >
      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details (only if you sign up):</strong> your email
          address and password. Passwords are stored hashed by our
          authentication provider and are never visible to us in plain text.
        </li>
        <li>
          <strong>Likes and listening history — on your device only:</strong>{' '}
          songs you like, your queue, your play history and your
          preferences are kept in your browser&apos;s local storage. They
          do <strong>not</strong> follow you across devices — signing in
          does not move them to our servers, and a new device starts
          with an empty library. Play counts are anonymous totals per
          song (how many times a song was played overall); they carry no
          account, email or device information and cannot be traced
          back to you.
        </li>
        <li>
          <strong>On your device only:</strong> your language choice,
          liked songs, queue, volume and cookie-consent choice are kept
          in your browser&apos;s local storage. They never leave your
          device.
        </li>
      </ul>
      <p>
        We do <strong>not</strong> run advertising trackers, we do{' '}
        <strong>not</strong> sell personal data to anyone, and we do{' '}
        <strong>not</strong> collect payment details — the app is free and
        takes no payments.
      </p>

      <h2>Third-party services</h2>
      <ul>
        <li>
          <strong>Supabase</strong> (authentication, database and storage):
          receives your email address and your hashed password. It also
          receives anonymous play counts — totals per song, with no
          account or device attached.
        </li>
        <li>
          <strong>Cloudflare Pages</strong> (hosting): receives your IP
          address and standard request logs when it serves the site, as any
          web host does.
        </li>
      </ul>
      <p>
        No other third-party service receives your data. We do not embed
        advertising networks, analytics beacons or social-media trackers.
      </p>

      <h2>Your rights (India — DPDP Act, 2023)</h2>
      <p>
        Under India&apos;s Digital Personal Data Protection Act, 2023 you may
        ask us to show you the personal data we hold about you, correct it,
        or delete it. To make a request, email{' '}
        <a href="mailto:officialnandhamusic@gmail.com">
          officialnandhamusic@gmail.com
        </a>{' '}
        from the email address on your account. We will act on verified
        requests within a reasonable time. Deleting your account removes
        your email from our servers. Likes and listening history live
        only on your device, so deleting the app or clearing its storage
        removes them; anonymous play totals cannot be traced back to you.
      </p>

      <h2>Children</h2>
      <p>
        The app is a general music service. Children under 18 should use it
        only with a parent or guardian&apos;s permission.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes, the updated date above will change and the new
        version will apply from the date it is published here.
      </p>
    </LegalPage>
  )
}
