// National ID handling. The platform keeps a one-way HASH for matching people across businesses, and an
// ENCRYPTED copy (AES-256-GCM) so the business that typed an ID can recognise "who paid / who is this" later.
//   • business panel / API (owner)  → full ID of ITS OWN records
//   • admin panel                   → masked (001****678); full ID only through an audited "reveal"
//   • other businesses              → never (they only ever see brand names)
const { encrypt, decrypt } = require("./secret");

const maskNid = (n) => (n && /^\d{10}$/.test(n) ? `${n.slice(0, 3)}****${n.slice(-3)}` : null);
const sealNid = (n) => (n ? encrypt(String(n)) : null);
const openNid = (enc) => decrypt(enc);

/** Row → what its owner may see: full ID + masked ID, never the ciphertext. */
const ownerView = ({ nationalIdEnc, ...rest }) => { const n = openNid(nationalIdEnc); return { ...rest, nationalId: n, nationalIdMasked: maskNid(n) }; };
/** Row → what an admin sees by default: masked only. */
const adminView = ({ nationalIdEnc, ...rest }) => ({ ...rest, nationalIdMasked: maskNid(openNid(nationalIdEnc)) });

module.exports = { maskNid, sealNid, openNid, ownerView, adminView };
