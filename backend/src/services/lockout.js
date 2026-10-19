// auth.md §2 — pure lockout rules (no I/O) so they are unit-testable.
const isLocked = (lockedUntil, now = new Date()) => !!lockedUntil && new Date(lockedUntil) > now;

// `failedAfterIncrement` is the counter AFTER this failed attempt was recorded.
function lockDecision(failedAfterIncrement, { maxFailedLogins, lockHours }, now = new Date()) {
  if (failedAfterIncrement >= maxFailedLogins) {
    return { lock: true, lockedUntil: new Date(now.getTime() + lockHours * 3600_000) };
  }
  return { lock: false, remaining: maxFailedLogins - failedAfterIncrement };
}

const LOCK_MESSAGE = "اکانت شما به دلیل تلاش‌های ناموفق مکرر به مدت ۴۸ ساعت قفل شده است";

module.exports = { isLocked, lockDecision, LOCK_MESSAGE };
