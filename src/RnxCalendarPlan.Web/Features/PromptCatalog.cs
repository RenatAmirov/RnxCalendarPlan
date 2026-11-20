using System.Text.Json;
using System.Globalization;
using Microsoft.Extensions.Caching.Distributed;
using RnxCalendarPlan.Web.Domain;

namespace RnxCalendarPlan.Web.Features;

public sealed record PracticePrompt(string Id, string Tool, string Title, string Description, string Duration, string Text);

public sealed class PromptCatalog(IDistributedCache cache, ILogger<PromptCatalog> logger)
{
    public static readonly PracticePrompt[] Templates =
    [
        new("interview", "ChatGPT", "Техническое интервью", "Отвечайте вслух, получайте обратную связь и находите слабые места.", "45–60 минут",
            "Ты — интервьюер по C#/.NET. {{interviewContext}} Проведи тренировочное интервью по типовым темам .NET; не выдавай свои вопросы за реальные вопросы компании. Задавай по одному вопросу: типы и коллекции, async/await, GC, ASP.NET Core, DI, EF Core и SQL. После моего ответа сначала задай уточняющий вопрос, затем оцени точность по шкале 0–3, исправь ошибки и покажи короткий пример. Не подсказывай до моего ответа. В конце составь список из трёх пробелов и план повторения. Начни с вопроса о value и reference types."),
        new("review", "Codex", "Code review небольшого API", "Найдите ошибки в коде и объясните, почему предложенные изменения нужны.", "30–45 минут",
            "Проверь текущий C# / ASP.NET Core проект как учебное code review. Сначала прочитай инструкции проекта. Найди до пяти конкретных проблем: async/cancellation, DI lifetime, EF Core N+1, конкурентные записи и обработка ошибок. Для каждой укажи файл, сценарий воспроизведения, последствия и минимальное исправление. Сначала покажи выводы, не меняя код. После моего выбора внеси правку и проверь её подходящим тестом. Попроси меня объяснить причину ошибки своими словами."),
        new("gaps", "ChatGPT", "Проверка понимания", "Превратите сложную тему в понятное объяснение и короткие карточки.", "20–30 минут",
            "Помоги проверить моё понимание C#/.NET. Спроси, какую тему я хочу повторить. Затем попроси объяснить её своими словами без подсказок. Найди неточности, задай два вопроса на граничные случаи и предложи небольшую задачу на код. Различай гарантии языка и детали реализации. Дай ссылки на официальную документацию для проверки спорных утверждений. В конце сделай три карточки: вопрос, мой пробел, краткий правильный ответ."),
        new("coding", "Codex", "Практика: кешируемый сервис", "От постановки задачи до тестов — с объяснением каждого решения.", "45–60 минут",
            "Выступи наставником, пока я реализую на C# сервис календаря: EF Core + PostgreSQL, Redis cache-aside и NLog. Дай небольшое задание на 45 минут с проверяемыми критериями: CRUD занятия, UTC-хранение даты, отмена запроса, защита от потерянного обновления и работа при недоступном Redis. Не пиши готовое решение сразу. Сначала попроси меня предложить дизайн. Затем проверяй мой код небольшими шагами, проси объяснять компромиссы и предлагай тест только для значимого поведения.")
    ];

    public async Task<PracticePrompt[]> GetAsync(CancellationToken ct)
    {
        const string key = "prompts:v2";
        try
        {
            var cached = await cache.GetStringAsync(key, ct);
            if (cached is not null) return JsonSerializer.Deserialize<PracticePrompt[]>(cached) ?? Templates;
            await cache.SetStringAsync(key, JsonSerializer.Serialize(Templates), new DistributedCacheEntryOptions
                { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24) }, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Redis unavailable; using built-in practice prompts");
        }
        return Templates;
    }

    // Cache only templates. User-owned goal details are read fresh and never stored in Redis.
    public static PracticePrompt[] ForGoal(PracticePrompt[] templates, InterviewGoal goal)
    {
        var moscow = TimeZoneInfo.ConvertTime(goal.StartsAt, TimeZoneInfo.FindSystemTimeZoneById("Europe/Moscow"));
        var date = moscow.ToString("dd.MM.yyyy 'в' HH:mm", CultureInfo.InvariantCulture);
        var context = $"Я готовлюсь к собеседованию. Компания: {goal.Company}. Этап: {goal.Title}. Встреча: {date} МСК.";
        return templates.Select(prompt => prompt with { Text = prompt.Text.Replace("{{interviewContext}}", context, StringComparison.Ordinal) }).ToArray();
    }
}
