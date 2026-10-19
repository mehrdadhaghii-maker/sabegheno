/**
 * PostalCodeInfo — resolves a 10-digit postal code to a full address, via
 * api.ir. General-purpose utility (e.g. confirming a business's registered
 * address), not part of the credit-scoring pipeline itself.
 *
 * Endpoint: POST /api/sw1/PostalCodeInfo
 * Body:     { postalCode }
 * Response: { data: { province, city, town, district, street, street2,
 *             number, floor, sideFloor, buildingName, description } }
 */
const { apiIrRequest } = require("./apiIrClient");
const env = require("../config/env");

async function lookupAddressByPostalCode(postalCode) {
  if (!env.apiIr.apiKey) {
    const err = new Error("api.ir is not configured");
    err.code = "NOT_CONFIGURED";
    throw err;
  }

  const payload = await apiIrRequest("/api/sw1/PostalCodeInfo", { postalCode });
  const data = payload.data || {};

  return {
    province: data.province || null,
    city: data.city || null,
    town: data.town || null,
    district: data.district || null,
    street: data.street || null,
    street2: data.street2 || null,
    number: data.number || null,
    floor: data.floor || null,
    sideFloor: data.sideFloor || null,
    buildingName: data.buildingName || null,
    description: data.description || null,
  };
}

module.exports = { lookupAddressByPostalCode };
