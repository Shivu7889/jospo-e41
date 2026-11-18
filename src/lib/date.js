/**
 * Get today's date string in YYYY-MM-DD format in Indian Standard Time (IST).
 * This avoids the UTC bug where toISOString().split('T')[0] returns yesterday
 * between 12:00 AM and 5:30 AM IST.
 */
export function getTodayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/**
 * Get a date string in YYYY-MM-DD format in IST from a Date object.
 */
export function toISTDateString(date) {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
