/**
 * App-level feature flags. Single source of truth so a path can be toggled in
 * exactly one place.
 */

/**
 * Whether new-account creation (sign up) is offered in the UI. When false, the
 * auth page renders only the login form and every landing CTA routes to login;
 * the signup code stays intact and is re-enabled by flipping this back to true.
 * Note: new sign ups are also blocked at the Supabase level for now.
 */
export const SIGNUPS_ENABLED = false;
