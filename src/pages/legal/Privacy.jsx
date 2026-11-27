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
      updated="Last updated: 27 November 2026"
      tamilSummary="இந்தச் செயலி கணக்குக்காக உங்கள் மின்னஞ்சல் மற்றும் கடவுச்சொல்லை மட்டுமே சேமிக்கிறது. உள்நுழைந்திருந்தால், நீங்கள் விரும்பும் பாடல்கள், பின்தொடர்வுகள் மற்றும் பட்டியல்கள் சேவையகத்தில் ஒத்திசைக்கப்படும் — விருந்தினராக இருந்தால் அவை உங்கள் சாதனத்தில் மட்டுமே இருக்கும். விளம்பர குக்கீகள் இல்லை, உங்கள் தகவல் யாருக்கும் விற்கப்படுவதில்லை. உங்கள் தகவலைப் பார்க்க, திருத்த அல்லது நீக்க விரும்பினால் officialnandhamusic@gmail.com என்ற முகவரிக்கு மின்னஞ்சல் அனுப்புங்கள்."
    >
      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details (only if you sign up):</strong> your email
          address and password. Passwords are stored hashed by our
          authentication provider and are never visible to us in plain text.
        </li>
        <li>
          <strong>Likes, follows and playlists — synced when you sign in:</strong>{' '}
          if you are signed in, the songs you like, the artists you
          follow and the playlists you create are saved to our servers
          (Supabase) so they follow you across devices. If you use the
          app as a guest, they are kept only in your browser&apos;s local
          storage on this device and do <strong>not</strong> follow you
          across devices. Your queue, your play history and your
          preferences always stay on your device. Play counts are
          anonymous totals per song (how many times a song was played
          overall); they carry no account, email or device information
          and cannot be traced back to you.
        </li>
        <li>
          <strong>On your device only:</strong> your language choice,
          queue, volume and cookie-consent choice are kept in your
          browser&apos;s local storage. They never leave your device.
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
          receives your email address and your hashed password. If you
          are signed in it also receives your liked songs, followed
          artists and playlists, so they sync across your devices. It
          also receives anonymous play counts — totals per song, with no
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
        your email and your synced likes, follows and playlists from our
        servers. Anything kept only on your device (language, queue,
        volume, and — for guests — likes, follows and playlists) is
        removed by clearing the app&apos;s data in Settings or by
        clearing your browser storage; anonymous play totals cannot be
        traced back to you.
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
