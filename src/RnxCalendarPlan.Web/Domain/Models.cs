namespace RnxCalendarPlan.Web.Domain;

public sealed class StudySession
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Title { get; set; } = "";
    public string Track { get; set; } = "csharp";
    public string Kind { get; set; } = "theory";
    public DateTimeOffset StartsAt { get; set; }
    public int DurationMinutes { get; set; } = 60;
    public string Status { get; set; } = "planned";
    public string Notes { get; set; } = "";
    public string Outcome { get; set; } = "";
    public string? TopicId { get; set; }
    public int Version { get; set; } = 1;
}

public sealed class LearningTopic
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public string Track { get; set; } = "csharp";
    public string Summary { get; set; } = "";
    public string ResourceUrl { get; set; } = "";
    public string[] Questions { get; set; } = [];
    public int Mastery { get; set; }
    public string Notes { get; set; } = "";
    public int Version { get; set; } = 1;
}

public sealed class InterviewGoal
{
    public int Id { get; set; } = 1;
    public string Company { get; set; } = "Т-Банк";
    public string Title { get; set; } = "C#/.NET · первый этап";
    public DateTimeOffset StartsAt { get; set; } = new(2026, 11, 23, 6, 0, 0, TimeSpan.Zero);
    public int DurationMinutes { get; set; } = 60;
    public string Notes { get; set; } = "Проверить связь, подготовить IDE и вопросы команде. Длительность 60 минут указана для планирования — уточните её у рекрутера.";
    public int Version { get; set; } = 1;
}
