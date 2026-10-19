/**
 * PersonInfo (استعلام ثبت‌احوال) — verifies a national ID's real name and
 * whether the person is alive, via api.ir.
 *
 * Endpoint: POST /api/sw1/PersonInfo
 * Body:     { nationalCode, birthDate }   (birthDate format: "1371/1/1")
 * Response: { data: { nationalCode, firstName, lastName, fatherName,
 *             gender, alive } }
 *
 * Needs birthDate, which nothing in sabegheno collects by default — so
 * this is optional enrichment: only called when a birth date is actually
 * provided (e.g. a business adds it on the New Check form to double-check
 * the customer's identity), never required.
 */
const { apiIrRequest } = require("./apiIrClient");
const env = require("../config/env");

async function verifyPersonIdentity(nationalId, birthDate) {
  if (!env.apiIr.apiKey) {
    return { available: false, source: "unavailable" };
  }

  const payload = await apiIrRequest("/api/sw1/PersonInfo", {
    nationalCode: nationalId,
    birthDate,
  });
  const data = payload.data || {};

  return {
    available: true,
    fullName: [data.firstName, data.lastName].filter(Boolean).join(" ") || null,
    fatherName: data.fatherName || null,
    alive: typeof data.alive === "boolean" ? data.alive : null,
    source: "ok",
  };
}

module.exports = { verifyPersonIdentity };
