import { useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { checkoutUrl, consumeCheckoutIntent } from './checkout';

/**
 * Finishes the "subscribe while logged out" flow. When a logged-out user picks a
 * paid plan on the landing, Pricing parks the choice (setCheckoutIntent) and
 * sends them to sign up / log in. Once they are authenticated, this reads the
 * parked intent ONCE and sends them straight to the right Kiwify checkout, with
 * their email injected, so they never have to click "Assinar" again.
 *
 * Renders nothing. Mounted inside the authenticated app shell (AuthedApp), so its
 * effect runs as soon as the user has a session/email.
 */
export function CheckoutIntentRedirect() {
  const { user } = useAuth();
  const email = user?.email ?? null;

  useEffect(() => {
    if (!email) return;
    const intent = consumeCheckoutIntent();
    if (!intent) return;
    // Full navigation (we are leaving the SPA to go pay on Kiwify).
    window.location.assign(checkoutUrl(intent.plan, intent.cycle, email));
  }, [email]);

  return null;
}
