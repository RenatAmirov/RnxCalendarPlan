using System.Net;
using System.Net.Http.Json;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using RnxCalendarPlan.Web.Data;
using RnxCalendarPlan.Web.Domain;
using RnxCalendarPlan.Web.Features;

namespace RnxCalendarPlan.Tests;

public sealed class PlannerFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    // Always use a new disposable database, never the application's database.
    private readonly string connection = new Npgsql.NpgsqlConnectionStringBuilder(
        Environment.GetEnvironmentVariable("RNX_TEST_POSTGRES") ??
        "Host=127.0.0.1;Port=15432;Username=rnx;Password=rnx_local_dev;Timeout=5")
        { Database = "rnx_test_" + Guid.NewGuid().ToString("N") }.ConnectionString;

    protected override void ConfigureWebHost(IWebHostBuilder builder) => builder.ConfigureAppConfiguration((_, configuration) =>
        configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:Postgres"] = connection }));

    public Task InitializeAsync() { _ = Server; return Task.CompletedTask; }
    public new async Task DisposeAsync()
    {
        await using var db = new PlannerDbContext(new DbContextOptionsBuilder<PlannerDbContext>().UseNpgsql(connection).Options);
        await db.Database.EnsureDeletedAsync();
        await base.DisposeAsync();
    }
}

public sealed class PlannerTests(PlannerFactory factory) : IClassFixture<PlannerFactory>
{
    private readonly HttpClient client = factory.CreateClient();
    private static SessionRequest Valid() => new("Практика UTC", "csharp", "practice",
        new DateTimeOffset(2026, 11, 22, 17, 0, 0, TimeSpan.FromHours(4)), 45, "planned", "Мои выводы", "Объяснить решение", null);

    [Fact]
    public async Task GoalAndSeedAreCorrectAndNotRepeated()
    {
        var first = await client.GetFromJsonAsync<Plan>("/api/plan");
        Assert.NotNull(first);
        Assert.Equal(new DateTimeOffset(2026, 11, 23, 6, 0, 0, TimeSpan.Zero), first.Goal.StartsAt);
        Assert.Equal(12, first.Topics.Length);
        Assert.Equal(13, first.Sessions.Length);
        Assert.All(first.Sessions, session => Assert.Equal("planned", session.Status));
        await using var scope = factory.Services.CreateAsyncScope();
        await SeedData.InitializeAsync(scope.ServiceProvider.GetRequiredService<PlannerDbContext>());
        var again = await client.GetFromJsonAsync<Plan>("/api/plan");
        Assert.Equal(first.Sessions.Select(s => s.Id), again!.Sessions.Select(s => s.Id));
    }

    [Fact]
    public async Task CrudPersistsUtcAndProtectsAgainstLostUpdates()
    {
        var createdResponse = await client.PostAsJsonAsync("/api/sessions", Valid());
        Assert.Equal(HttpStatusCode.Created, createdResponse.StatusCode);
        var created = (await createdResponse.Content.ReadFromJsonAsync<StudySession>())!;
        Assert.Equal(13, created.StartsAt.Hour);
        Assert.Equal(TimeSpan.Zero, created.StartsAt.Offset);
        var update = Valid() with { Status = "completed", Notes = "Сохранённый результат", Version = created.Version };
        var updatedResponse = await client.PutAsJsonAsync($"/api/sessions/{created.Id}", update);
        updatedResponse.EnsureSuccessStatusCode();
        var updated = (await updatedResponse.Content.ReadFromJsonAsync<StudySession>())!;
        var stale = await client.PutAsJsonAsync($"/api/sessions/{created.Id}", update);
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        var staleDelete = await client.DeleteAsync($"/api/sessions/{created.Id}?version={created.Version}");
        Assert.Equal(HttpStatusCode.Conflict, staleDelete.StatusCode);
        var plan = await client.GetFromJsonAsync<Plan>("/api/plan");
        Assert.Contains(plan!.Sessions, s => s.Id == created.Id && s.Notes == "Сохранённый результат" && s.Status == "completed");
        var deleted = await client.DeleteAsync($"/api/sessions/{created.Id}?version={updated.Version}");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync($"/api/sessions/{created.Id}?version={updated.Version}")).StatusCode);
    }

    [Theory]
    [InlineData("", 60, "csharp")]
    [InlineData("Title", 0, "csharp")]
    [InlineData("Title", 481, "csharp")]
    [InlineData("Title", 60, "unsupported")]
    public async Task InvalidSessionsAreRejected(string title, int minutes, string track)
    {
        var response = await client.PostAsJsonAsync("/api/sessions", Valid() with { Title = title, DurationMinutes = minutes, Track = track });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task TopicNotesPersistAndRejectStaleWrites()
    {
        var plan = (await client.GetFromJsonAsync<Plan>("/api/plan"))!;
        var topic = plan.Topics.Single(t => t.Id == "async");
        var body = new TopicRequest(2, "async не обязательно создаёт поток", topic.Version);
        var response = await client.PutAsJsonAsync("/api/topics/async", body);
        response.EnsureSuccessStatusCode();
        var saved = (await response.Content.ReadFromJsonAsync<LearningTopic>())!;
        Assert.Equal(2, saved.Mastery);
        Assert.Equal(body.Notes, saved.Notes);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync("/api/topics/async", body)).StatusCode);
        await client.PutAsJsonAsync("/api/topics/async", new TopicRequest(topic.Mastery, topic.Notes, saved.Version));
    }

    [Fact]
    public async Task CalendarAndUnknownApiHaveCorrectContentTypes()
    {
        var response = await client.GetAsync("/api/export/calendar.ics");
        Assert.Equal("text/calendar", response.Content.Headers.ContentType!.MediaType);
        Assert.Contains("DTSTART:20261123T060000Z", await response.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/missing")).StatusCode);
    }

    [Fact]
    public async Task ChangedGoalUpdatesPromptContextAndRejectsStaleWrites()
    {
        var original = (await client.GetFromJsonAsync<Plan>("/api/plan"))!.Goal;
        var before = (await client.GetFromJsonAsync<PracticePrompt[]>("/api/prompts"))!.Single(p => p.Id == "interview");
        Assert.Contains("23.11.2026 в 09:00 МСК", before.Text);
        var request = new GoalRequest("Учебная компания", "Повторное интервью",
            new DateTimeOffset(2026, 11, 24, 11, 30, 0, TimeSpan.FromHours(4)), 75, "Проверка контекста", original.Version);
        var response = await client.PutAsJsonAsync("/api/goal", request);
        response.EnsureSuccessStatusCode();
        var saved = (await response.Content.ReadFromJsonAsync<InterviewGoal>())!;
        try
        {
            Assert.Equal(TimeSpan.Zero, saved.StartsAt.Offset);
            Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync("/api/goal", request)).StatusCode);
            var after = (await client.GetFromJsonAsync<PracticePrompt[]>("/api/prompts"))!.Single(p => p.Id == "interview");
            Assert.Contains("Учебная компания", after.Text);
            Assert.Contains("Повторное интервью", after.Text);
            Assert.Contains("24.11.2026 в 10:30 МСК", after.Text);
            Assert.DoesNotContain("23.11.2026", after.Text);
            Assert.DoesNotContain("{{interviewContext}}", after.Text);
        }
        finally
        {
            (await client.PutAsJsonAsync("/api/goal", new GoalRequest(original.Company, original.Title,
                original.StartsAt, original.DurationMinutes, original.Notes, saved.Version))).EnsureSuccessStatusCode();
        }
    }

    private sealed record Plan(StudySession[] Sessions, LearningTopic[] Topics, InterviewGoal Goal);
}

public sealed class ExportAndCacheTests
{
    [Fact]
    public void CalendarEscapesTextAndFoldsUtf8WithoutCorruption()
    {
        var title = string.Concat(Enumerable.Repeat("Проверка😀", 15)) + ";раз,два\nстрока";
        var session = new StudySession { Title = title, StartsAt = new(2026, 11, 20, 9, 0, 0, TimeSpan.FromHours(3)), DurationMinutes = 30 };
        var text = Encoding.UTF8.GetString(CalendarExporter.Export([session], new InterviewGoal(), DateTimeOffset.UtcNow));
        Assert.All(text.Split("\r\n"), line => Assert.True(Encoding.UTF8.GetByteCount(line) <= 75));
        var unfolded = text.Replace("\r\n ", "");
        Assert.Contains("DTSTART:20261120T060000Z", unfolded);
        Assert.Contains("DTEND:20261120T063000Z", unfolded);
        Assert.Contains("\\;раз\\,два\\nстрока", unfolded);
        Assert.DoesNotContain('\uFFFD', text);
    }

    [Fact]
    public async Task PromptsRemainAvailableWhenRedisIsDown()
    {
        var catalog = new PromptCatalog(new UnavailableCache(), NullLogger<PromptCatalog>.Instance);
        var prompts = await catalog.GetAsync(CancellationToken.None);
        Assert.Equal(4, prompts.Length);
        Assert.Contains(prompts, p => p.Tool == "Codex");
    }

    private sealed class UnavailableCache : IDistributedCache
    {
        public byte[]? Get(string key) => throw new IOException("Redis is down");
        public Task<byte[]?> GetAsync(string key, CancellationToken token = default) => throw new IOException("Redis is down");
        public void Refresh(string key) => throw new NotSupportedException();
        public Task RefreshAsync(string key, CancellationToken token = default) => throw new NotSupportedException();
        public void Remove(string key) => throw new NotSupportedException();
        public Task RemoveAsync(string key, CancellationToken token = default) => throw new NotSupportedException();
        public void Set(string key, byte[] value, DistributedCacheEntryOptions options) => throw new NotSupportedException();
        public Task SetAsync(string key, byte[] value, DistributedCacheEntryOptions options, CancellationToken token = default) => throw new NotSupportedException();
    }
}
