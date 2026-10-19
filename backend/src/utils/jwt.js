const jwt = require("jsonwebtoken");
const env = require("../config/env");

// Access tokens are short-lived (default 15 min); the session behind them is
// what actually enforces idle-timeout and single-session rules.
function signToken(payload) {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.auth.accessTtl, algorithm: "HS256" });
}

function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] });
}

module.exports = { signToken, verifyToken };
