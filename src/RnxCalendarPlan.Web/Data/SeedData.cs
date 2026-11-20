using Microsoft.EntityFrameworkCore;
using RnxCalendarPlan.Web.Domain;

namespace RnxCalendarPlan.Web.Data;

public static class SeedData
{
    public static async Task InitializeAsync(PlannerDbContext db)
    {
        // The goal is a persistent seed marker; the advisory lock also protects parallel startups.
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(72401123)");
        if (await db.Goals.AnyAsync()) return;
        db.Topics.AddRange(
            Topic("types", "Типы, память и семантика", "csharp", "Value/reference types, boxing, record, struct, равенство и передача параметров.", "https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/types/", ["Чем отличается копирование структуры от копирования ссылки?", "Когда происходит boxing и как его заметить?", "Как связаны Equals и GetHashCode?"]),
            Topic("collections", "Коллекции и generics", "csharp", "List, Dictionary, HashSet, сложность операций и ограничения обобщений.", "https://learn.microsoft.com/en-us/dotnet/standard/collections/", ["Как устроен Dictionary и что происходит при коллизиях?", "Когда выбрать HashSet вместо List?", "Что дают covariance и contravariance?"]),
            Topic("async", "Асинхронность и потоки", "csharp", "async/await, Task, CancellationToken, синхронизация и обработка ошибок.", "https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/", ["Почему async не означает новый поток?", "Чем Task.WhenAll отличается от последовательных await?", "Как передать отмену через несколько слоёв приложения?"]),
            Topic("linq", "LINQ и выполнение запросов", "csharp", "Отложенное выполнение, IEnumerable/IQueryable, повторная материализация.", "https://learn.microsoft.com/en-us/dotnet/csharp/linq/", ["Когда выполняется LINQ-запрос?", "Где проходит граница между IQueryable и IEnumerable?", "Чем опасно несколько раз перечислять один источник?"]),
            Topic("gc", "CLR, GC и ресурсы", "dotnet", "Поколения GC, корни, LOH, IDisposable и время жизни объектов.", "https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/fundamentals", ["Как GC понимает, что объект больше не нужен?", "Чем освобождение памяти отличается от Dispose?", "Может ли в управляемом приложении быть утечка памяти?"]),
            Topic("aspnet", "ASP.NET Core и DI", "dotnet", "Конвейер middleware, scoped/singleton/transient, ошибки и отмена HTTP-запросов.", "https://learn.microsoft.com/en-us/aspnet/core/fundamentals/dependency-injection?view=aspnetcore-10.0", ["Почему singleton не должен захватывать scoped-сервис?", "Почему важен порядок middleware?", "Как RequestAborted связан с CancellationToken?"]),
            Topic("ef", "Entity Framework Core", "data", "Tracking, проекции, N+1, миграции, транзакции и optimistic concurrency.", "https://learn.microsoft.com/en-us/ef/core/querying/", ["Когда использовать AsNoTracking?", "Как обнаружить и исправить проблему N+1?", "Что произойдёт при конкурентном обновлении одной записи?"]),
            Topic("sql", "PostgreSQL и индексы", "data", "B-tree индексы, EXPLAIN, изоляция транзакций и параметризованные запросы.", "https://www.postgresql.org/docs/current/indexes.html", ["Почему индекс может не использоваться?", "Что гарантирует уровень Read Committed?", "Почему порядок полей составного индекса имеет значение?"]),
            Topic("redis", "Redis и кеширование", "data", "Cache-aside, TTL, инвалидация и поведение при недоступности кеша.", "https://redis.io/docs/latest/develop/", ["Как не вернуть устаревшие данные после записи?", "Что такое cache stampede?", "Что должно случиться, если Redis недоступен?"]),
            Topic("design", "SOLID и тестируемость", "dotnet", "Границы ответственности, композиция, контракт интерфейса и полезные тесты.", "https://learn.microsoft.com/en-us/dotnet/core/testing/", ["Как отличить полезную абстракцию от лишнего интерфейса?", "Что тестировать в прикладном сервисе?", "Когда интеграционный тест полезнее mock-объектов?"]),
            Topic("chatgpt", "ChatGPT: пробное интервью", "ai", "Формулируйте контекст, отвечайте без подсказок и проверяйте обратную связь по документации.", "https://chatgpt.com/", ["Могу ли я объяснить решение без подсказки?", "Какие утверждения в ответе AI нужно проверить?", "Как превратить ошибку в карточку для повторения?"]),
            Topic("codex", "Codex: практика на коде", "ai", "Небольшие задачи, явные критерии приёмки, просмотр diff и самостоятельное объяснение изменений.", "https://developers.openai.com/codex/", ["Как задать проверяемые критерии готовности?", "Какие изменения требуют ручного review?", "Смогу ли я воспроизвести решение без агента?"])
        );
        db.Goals.Add(new InterviewGoal());
        db.Sessions.AddRange(
            Session(20, 10, 0, 75, "Типы и семантика C#", "csharp", "theory", "types", "Объяснить value/reference types, boxing и равенство на трёх примерах."),
            Session(20, 13, 0, 60, "Коллекции: выбрать и обосновать", "csharp", "practice", "collections", "Реализовать подсчёт частот через Dictionary и объяснить сложность."),
            Session(20, 16, 0, 75, "async/await без магии", "csharp", "practice", "async", "Написать параллельные запросы с отменой и обработкой ошибок."),
            Session(20, 19, 0, 30, "Разбор пробелов с ChatGPT", "ai", "review", "chatgpt", "Получить пять вопросов по темам дня. Сохранить ошибки в заметках."),
            Session(21, 10, 0, 60, "Память, GC и IDisposable", "dotnet", "theory", "gc", "Нарисовать путь объекта от выделения памяти до сборки; объяснить using."),
            Session(21, 11, 30, 75, "ASP.NET Core: запрос изнутри", "dotnet", "practice", "aspnet", "Проследить запрос через middleware и проверить времена жизни DI."),
            Session(21, 14, 0, 75, "EF Core, SQL и N+1", "data", "practice", "ef", "Сравнить SQL до и после проекции. Повторить индексы и транзакции."),
            Session(21, 16, 0, 45, "Code review вместе с Codex", "ai", "practice", "codex", "Проверить diff небольшого API, запустить тесты и объяснить каждую правку."),
            Session(22, 10, 0, 60, "LINQ и повторение слабых тем", "csharp", "practice", "linq", "Решить задачу с группировкой, объяснить отложенное выполнение."),
            Session(22, 12, 0, 60, "Пробное техническое интервью", "dotnet", "mock", "design", "Ответить вслух без подсказок: C#, async, GC, ASP.NET Core, EF Core."),
            Session(22, 16, 0, 45, "Закрыть пробелы после интервью", "dotnet", "review", null, "Разобрать три самых слабых ответа и повторить примеры."),
            Session(22, 18, 0, 30, "Краткий конспект и вопросы команде", "dotnet", "review", null, "Подготовить рассказ о проекте, три вопроса команде и проверить связь."),
            Session(23, 8, 15, 20, "Спокойная разминка перед встречей", "csharp", "review", null, "Просмотреть конспект. Не начинать новые темы. Открыть IDE и проверить звук.")
        );
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
    }

    private static LearningTopic Topic(string id, string title, string track, string summary, string url, string[] questions)
        => new() { Id = id, Title = title, Track = track, Summary = summary, ResourceUrl = url, Questions = questions };
    private static StudySession Session(int day, int hour, int minute, int duration, string title, string track, string kind, string? topic, string outcome)
        => new() { Title = title, Track = track, Kind = kind, TopicId = topic, Outcome = outcome, DurationMinutes = duration,
            StartsAt = new DateTimeOffset(2026, 11, day, hour, minute, 0, TimeSpan.FromHours(3)).ToUniversalTime() };
}
