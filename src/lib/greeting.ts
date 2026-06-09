/** Time-of-day greeting in Brazilian Portuguese. */
export function greeting(date: Date = new Date()): string {
  const h = date.getHours();
  // Boundaries kept in sync with dayPartForHour (the hero art):
  // morning 05–10, afternoon 11–16, evening/night 17–04.
  if (h >= 5 && h < 11) return 'Bom dia';
  if (h >= 11 && h < 17) return 'Boa tarde';
  return 'Boa noite';
}

/** Streak of consecutive local days (ending today) that have at least one review. */
export function computeStreak(reviewDayKeys: Set<string>): number {
  let streak = 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  // Allow the streak to be "alive" if today has no reviews yet but yesterday did.
  for (let i = 0; i < 3650; i += 1) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (reviewDayKeys.has(key)) {
      streak += 1;
    } else if (i === 0) {
      // today empty — keep checking from yesterday without breaking
    } else {
      break;
    }
    d.setDate(d.getDate() - 1);
  }
  return streak;
}
