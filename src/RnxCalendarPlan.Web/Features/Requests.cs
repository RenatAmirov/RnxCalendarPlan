namespace RnxCalendarPlan.Web.Features;

public sealed record SessionRequest(string? Title, string? Track, string? Kind, DateTimeOffset StartsAt,
    int DurationMinutes, string? Status, string? Notes, string? Outcome, string? TopicId, int Version = 0);
public sealed record TopicRequest(int Mastery, string? Notes, int Version);
public sealed record GoalRequest(string? Company, string? Title, DateTimeOffset StartsAt, int DurationMinutes, string? Notes, int Version);

public static class RequestValidation
{
    public static readonly string[] Tracks = ["csharp", "dotnet", "data", "ai"];
    public static readonly string[] Kinds = ["theory", "practice", "review", "mock"];
    public static readonly string[] Statuses = ["planned", "inProgress", "completed"];

    public static Dictionary<string, string[]> Validate(SessionRequest value)
    {
        var errors = ValidateSchedule(value.Title, value.StartsAt, value.DurationMinutes, value.Notes);
        if (!Tracks.Contains(value.Track)) errors["track"] = ["Выберите направление."];
        if (!Kinds.Contains(value.Kind)) errors["kind"] = ["Выберите формат занятия."];
        if (!Statuses.Contains(value.Status)) errors["status"] = ["Неизвестный статус."];
        if (value.Outcome?.Length > 1000) errors["outcome"] = ["Результат: не более 1000 символов."];
        return errors;
    }

    public static Dictionary<string, string[]> ValidateSchedule(string? title, DateTimeOffset startsAt, int duration, string? notes)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(title) || title.Trim().Length > 160) errors["title"] = ["Название: от 1 до 160 символов."];
        if (startsAt.Year is < 2000 or > 2100) errors["startsAt"] = ["Укажите корректную дату (2000–2100)."];
        if (duration is < 5 or > 480) errors["durationMinutes"] = ["Длительность: от 5 до 480 минут."];
        if (notes?.Length > 8000) errors["notes"] = ["Заметки: не более 8000 символов."];
        return errors;
    }
}
