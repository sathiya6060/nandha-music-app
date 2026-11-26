import LegalPage from './LegalPage.jsx'

/**
 * Refund Policy — honest: the app is free, no payment is ever taken, so
 * there is nothing to refund. If paid features ever arrive, this policy
 * is updated before any charge is taken.
 */
export default function Refund() {
  return (
    <LegalPage
      title="Refund Policy"
      updated="Last updated: 26 November 2026"
      tamilSummary="இந்தச் செயலி முற்றிலும் இலவசம் — எந்தக் கட்டணமும் வசூலிக்கப்படுவதில்லை, எனவே திருப்பித் தருவதற்கு எதுவும் இல்லை. எதிர்காலத்தில் கட்டண வசதிகள் வந்தால், கட்டணம் வசூலிக்கப்படுவதற்கு முன்பே இந்தக் கொள்கை புதுப்பிக்கப்படும்."
    >
      <h2>No charges, no refunds needed</h2>
      <p>
        Nandha Music is a free app. We do not charge for listening, signing
        up or any feature, and we never ask for card or payment details. Since
        no payment is ever taken, there is nothing to refund.
      </p>

      <h2>If paid features ever come</h2>
      <p>
        If we ever add a paid feature, this policy will be updated{' '}
        <strong>before</strong> any charge is taken, and the update will state
        the price, what you get, and the refund terms for that feature in
        plain language. You will never be charged without being told the price
        first.
      </p>

      <h2>Questions</h2>
      <p>
        If you believe you were charged for something by mistake, or you have
        any billing question, write to{' '}
        <a href="mailto:officialnandhamusic@gmail.com">
          officialnandhamusic@gmail.com
        </a>{' '}
        and we will look into it.
      </p>
    </LegalPage>
  )
}
