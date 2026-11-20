using System.Globalization;
using System.Text;
using RnxCalendarPlan.Web.Domain;

namespace RnxCalendarPlan.Web.Features;

public static class CalendarExporter
{
    public static byte[] Export(IEnumerable<StudySession> sessions, InterviewGoal goal, DateTimeOffset now)
    {
        var lines = new List<string> { "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//RNX//Calendar Plan//RU", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:План подготовки C#/.NET" };
        foreach (var session in sessions)
            AddEvent(lines, session.Id.ToString(), session.Title, session.StartsAt, session.DurationMinutes, session.Outcome + "\n" + session.Notes, now);
        AddEvent(lines, "interview-1", $"{goal.Company}: {goal.Title}", goal.StartsAt, goal.DurationMinutes, goal.Notes, now);
        lines.Add("END:VCALENDAR");
        return Encoding.UTF8.GetBytes(string.Join("\r\n", lines.Select(Fold)) + "\r\n");
    }

    private static void AddEvent(List<string> lines, string id, string title, DateTimeOffset start, int duration, string description, DateTimeOffset now)
        => lines.AddRange(["BEGIN:VEVENT", $"UID:{id}@rnxcalendar.local", $"DTSTAMP:{Format(now)}", $"DTSTART:{Format(start)}",
            $"DTEND:{Format(start.AddMinutes(duration))}", $"SUMMARY:{Escape(title)}", $"DESCRIPTION:{Escape(description)}", "STATUS:CONFIRMED", "END:VEVENT"]);
    private static string Format(DateTimeOffset value) => value.UtcDateTime.ToString("yyyyMMdd'T'HHmmss'Z'", CultureInfo.InvariantCulture);
    private static string Escape(string value) => value.Replace("\\", "\\\\").Replace("\r\n", "\n").Replace("\r", "\n").Replace("\n", "\\n").Replace(";", "\\;").Replace(",", "\\,");

    // RFC 5545: fold at 75 octets without splitting a UTF-8 code point.
    public static string Fold(string line)
    {
        var result = new StringBuilder();
        var bytes = 0;
        foreach (var rune in line.EnumerateRunes())
        {
            if (bytes + rune.Utf8SequenceLength > 75) { result.Append("\r\n "); bytes = 1; }
            result.Append(rune.ToString());
            bytes += rune.Utf8SequenceLength;
        }
        return result.ToString();
    }
}
