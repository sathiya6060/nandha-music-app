import LegalPage from './LegalPage.jsx'

/**
 * Terms & Conditions — real and specific to this app. Free service, no
 * payments, Indian law (IT Act 2000, Consumer Protection Act 2019).
 */
export default function Terms() {
  return (
    <LegalPage
      title="Terms & Conditions"
      updated="Last updated: 26 November 2026"
      tamilSummary="இந்தச் செயலி முற்றிலும் இலவசம்; கட்டணம் எதுவும் இல்லை. அனைத்து பாடல்களும் படங்களும் நந்தா மியூசிக்கின் உடைமை. உங்கள் கணக்கின் கடவுச்சொல்லைப் பாதுகாப்பது உங்கள் பொறுப்பு. இந்தியச் சட்டங்கள் பொருந்தும்."
    >
      <h2>1. A free service</h2>
      <p>
        Nandha Music is a free music app. There are no charges, no
        subscriptions and no in-app purchases. We collect no payment details
        of any kind.
      </p>

      <h2>2. Accounts</h2>
      <p>
        You may listen to a 5-second preview of each song without an account.
        Signing up with an email address and password unlocks full songs. You
        are responsible for keeping your password safe and for everything done
        on your account. Tell us at{' '}
        <a href="mailto:officialnandhamusic@gmail.com">
          officialnandhamusic@gmail.com
        </a>{' '}
        if you believe your account has been misused.
      </p>

      <h2>3. Our content</h2>
      <p>
        All songs, lyrics, artwork and images in the app are © Nandha Music
        and our composers, and are protected by copyright law. You may listen
        for your own personal use. You may not copy, redistribute, re-upload
        or commercially exploit the songs or artwork without our written
        permission.
      </p>

      <h2>4. Acceptable use</h2>
      <p>
        Do not misuse the service: no scraping or bulk downloading of songs,
        no attempts to break into accounts or systems, and no use of the app
        to harass, spam or mislead others. We may suspend or close accounts
        that abuse the service.
      </p>

      <h2>5. Availability</h2>
      <p>
        The app runs on free-tier hosting and services, so we cannot promise
        uninterrupted availability. Features, songs and the catalogue may
        change or be withdrawn at any time. New songs are added as they
        release.
      </p>

      <h2>6. Law</h2>
      <p>
        These terms are governed by the laws of India, including the
        Information Technology Act, 2000 and the Consumer Protection Act,
        2019. If you have a consumer complaint, write to us first at the
        email above — we will try to resolve it directly. Disputes that
        cannot be resolved that way fall under the courts of Chennai, Tamil
        Nadu.
      </p>

      <h2>7. Changes</h2>
      <p>
        We may update these terms when the service changes. The updated date
        above will change, and continued use of the app after an update means
        you accept the new terms.
      </p>
    </LegalPage>
  )
}
