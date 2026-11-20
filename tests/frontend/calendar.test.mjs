import test from "node:test";
import assert from "node:assert/strict";
import {
    dateKey,
    addDays,
    monday,
    moveMonth,
    dayEvents,
} from "../../src/RnxCalendarPlan.Web/wwwroot/calendar-utils.mjs";

test("one UTC instant can belong to different calendar days in Moscow and Samara", () => {
    const instant = "2026-11-22T20:30:00Z";
    assert.equal(dateKey(instant, "Europe/Moscow"), "2026-11-22");
    assert.equal(dateKey(instant, "Europe/Samara"), "2026-11-23");
});

test("month navigation clamps the day and crosses years without skipping a month", () => {
    assert.equal(moveMonth("2026-01-31", 1), "2026-02-28");
    assert.equal(moveMonth("2028-01-31", 1), "2028-02-29");
    assert.equal(moveMonth("2026-12-31", 1), "2027-01-31");
    assert.equal(moveMonth("2026-03-31", -1), "2026-02-28");
});

test("week arithmetic crosses a year and leap day using date-only keys", () => {
    assert.equal(monday("2027-01-01"), "2026-12-28");
    assert.equal(addDays("2028-02-28", 1), "2028-02-29");
    assert.equal(addDays("2028-02-29", 1), "2028-03-01");
});

test("the warmup, interview, and later session appear in time order", () => {
    const goal = { id: 1, startsAt: "2026-11-23T06:00:00Z" };
    const sessions = [
        { id: "late", startsAt: "2026-11-23T08:00:00Z" },
        { id: "other-day", startsAt: "2026-11-22T08:00:00Z" },
        { id: "warmup", startsAt: "2026-11-23T05:15:00Z" },
    ];
    const result = dayEvents(sessions, goal, "2026-11-23", "Europe/Moscow");
    assert.deepEqual(
        result.map((event) => event.id),
        ["warmup", 1, "late"],
    );
    assert.equal(result[1].isGoal, true);
    assert.equal(goal.isGoal, undefined);
    assert.equal(sessions[0].id, "late");
});
