// Calendar arithmetic uses date-only keys; browser and server zones never enter the calculation.
export function dateKey(date, zone) {
    const parts = new Intl.DateTimeFormat("en", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date(date));
    const part = (name) => parts.find((p) => p.type === name).value;
    return `${part("year")}-${part("month")}-${part("day")}`;
}

export const keyDate = (key) => new Date(`${key}T12:00:00Z`);
export function addDays(key, days) {
    const date = keyDate(key);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}
export const monday = (key) =>
    addDays(key, -((keyDate(key).getUTCDay() + 6) % 7));

export function shiftMonth(month, delta) {
    const [year, number] = month.split("-").map(Number);
    return new Date(Date.UTC(year, number - 1 + delta, 1, 12))
        .toISOString()
        .slice(0, 7);
}

export function moveMonth(key, delta) {
    const month = shiftMonth(key.slice(0, 7), delta);
    const next = keyDate(`${shiftMonth(month, 1)}-01`);
    next.setUTCDate(0);
    return `${month}-${String(Math.min(Number(key.slice(-2)), next.getUTCDate())).padStart(2, "0")}`;
}

export function dayEvents(sessions, goal, key, zone) {
    return [
        ...sessions.filter(
            (session) => dateKey(session.startsAt, zone) === key,
        ),
        ...(dateKey(goal.startsAt, zone) === key
            ? [{ ...goal, isGoal: true }]
            : []),
    ].sort((left, right) => new Date(left.startsAt) - new Date(right.startsAt));
}

export function plural(number, one, few, many) {
    const last = Math.abs(number) % 100;
    return last >= 11 && last <= 14
        ? many
        : last % 10 === 1
          ? one
          : last % 10 >= 2 && last % 10 <= 4
            ? few
            : many;
}
