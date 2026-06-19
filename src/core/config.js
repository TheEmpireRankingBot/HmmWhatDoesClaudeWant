// Monetisation & branding — the one file to edit to turn the gallery into an
// income stream.
//
// Everything here is OPT-IN. With the empty placeholders below, no support or
// shop buttons and no embed badge appear, so the default site stays clean.
// Fill in your own links to switch each piece on — it's all static, so there's
// nothing to deploy beyond editing this file.
//
// The funnel this enables:
//   discovery (share card + free-embed back-links)
//     → product (4K wallpapers, video clips, live embeds)
//       → checkout (your shop / support links)
//         → recurring (membership) + upsell (a Pro licence)

export const config = {
  brand: 'Living Systems',

  // Your public site URL. Used for the share card and the small back-link badge
  // shown on free embeds (your growth loop). Leave '' to hide the badge.
  siteUrl: '', // e.g. 'https://livingsystems.art'

  links: {
    // Recurring income — a membership people can join (Patreon, Ko-fi, GitHub
    // Sponsors, …). Shown as "Support monthly".
    support: '',
    // One-off income — sell wallpaper / video packs (Gumroad, Lemon Squeezy, …).
    // Shown as "Get the packs".
    shop: '',
  },

  pro: {
    // A Pro licence (sold via your shop) white-labels embeds (removes the badge)
    // and unlocks 8K export. Two ways to verify a key — use either:
    //
    //  1) Offline allow-list: paste the SHA-256 hex digests of the keys you sell.
    //     (Hash a key with: `echo -n "THE-KEY" | shasum -a 256`.)
    keyHashes: [],
    //  2) Gumroad: set your product id to verify keys live against Gumroad's
    //     public licence API (best-effort; falls back to the allow-list).
    gumroadProductId: '',
  },
};

/** True when a config URL has actually been filled in. */
export function isLink(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

/** SHA-256 hex digest of a string, via the Web Crypto API. */
export async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify a licence key. Tries Gumroad if a product id is configured (best
 * effort — may be blocked by CORS), then falls back to the offline allow-list.
 * Returns true on success.
 */
export async function verifyLicence(key) {
  key = (key || '').trim();
  if (!key) return false;
  const { gumroadProductId, keyHashes } = config.pro;
  if (gumroadProductId) {
    try {
      const res = await fetch('https://api.gumroad.com/v2/licenses/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          product_id: gumroadProductId,
          license_key: key,
          increment_uses_count: 'false',
        }),
      });
      const data = await res.json();
      if (data && data.success) return true;
    } catch (e) {
      /* fall through to the offline allow-list */
    }
  }
  if (keyHashes && keyHashes.length) {
    const h = await sha256Hex(key);
    if (keyHashes.includes(h)) return true;
  }
  return false;
}
