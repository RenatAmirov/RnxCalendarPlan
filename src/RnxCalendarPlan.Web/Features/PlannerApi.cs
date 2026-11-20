using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using RnxCalendarPlan.Web.Data;
using RnxCalendarPlan.Web.Domain;

namespace RnxCalendarPlan.Web.Features;

public static class PlannerApi
{
    public static void MapPlannerApi(this WebApplication app)
    {
        var api = app.MapGroup("/api");
        api.MapGet("/plan", async (PlannerDbContext db, TimeProvider clock, CancellationToken ct) => Results.Ok(new
        {
            sessions = await db.Sessions.AsNoTracking().OrderBy(x => x.StartsAt).ToListAsync(ct),
            topics = await db.Topics.AsNoTracking().OrderBy(x => x.Id).ToListAsync(ct),
            goal = await db.Goals.AsNoTracking().SingleAsync(ct),
            now = clock.GetUtcNow()
        }));
        api.MapGet("/prompts", async (PromptCatalog catalog, PlannerDbContext db, CancellationToken ct) =>
        {
            var goal = await db.Goals.AsNoTracking().SingleAsync(ct);
            return Results.Ok(PromptCatalog.ForGoal(await catalog.GetAsync(ct), goal));
        });
        api.MapPost("/sessions", async (SessionRequest request, PlannerDbContext db, ILogger<StudySession> logger, CancellationToken ct) =>
        {
            var errors = RequestValidation.Validate(request);
            if (request.TopicId is not null && !await db.Topics.AnyAsync(x => x.Id == request.TopicId, ct)) errors["topicId"] = ["Тема не найдена."];
            if (errors.Count > 0) return Results.ValidationProblem(errors);
            var session = new StudySession();
            Apply(session, request);
            db.Sessions.Add(session);
            await db.SaveChangesAsync(ct);
            logger.LogInformation("Created study session {SessionId} at {StartsAt}", session.Id, session.StartsAt);
            return Results.Created($"/api/sessions/{session.Id}", session);
        });
        api.MapPut("/sessions/{id:guid}", async (Guid id, SessionRequest request, PlannerDbContext db, ILogger<StudySession> logger, CancellationToken ct) =>
        {
            var errors = RequestValidation.Validate(request);
            if (request.TopicId is not null && !await db.Topics.AnyAsync(x => x.Id == request.TopicId, ct)) errors["topicId"] = ["Тема не найдена."];
            if (errors.Count > 0) return Results.ValidationProblem(errors);
            var session = await db.Sessions.FindAsync([id], ct);
            if (session is null) return Results.NotFound();
            if (session.Version != request.Version) return Conflict();
            Apply(session, request);
            session.Version++;
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Conflict(); }
            logger.LogInformation("Updated study session {SessionId}, status {Status}", id, session.Status);
            return Results.Ok(session);
        });
        api.MapDelete("/sessions/{id:guid}", async (Guid id, int version, PlannerDbContext db, ILogger<StudySession> logger, CancellationToken ct) =>
        {
            var session = await db.Sessions.FindAsync([id], ct);
            if (session is null) return Results.NotFound();
            if (version != session.Version) return Conflict();
            db.Sessions.Remove(session);
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Conflict(); }
            logger.LogInformation("Deleted study session {SessionId}", id);
            return Results.NoContent();
        });
        api.MapPut("/topics/{id}", async (string id, TopicRequest request, PlannerDbContext db, CancellationToken ct) =>
        {
            if (request.Mastery is < 0 or > 3 || request.Notes?.Length > 8000)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["mastery"] = ["Уровень: от 0 до 3; заметки: до 8000 символов."] });
            var topic = await db.Topics.FindAsync([id], ct);
            if (topic is null) return Results.NotFound();
            if (request.Version != topic.Version) return Conflict();
            topic.Mastery = request.Mastery;
            topic.Notes = request.Notes?.Trim() ?? "";
            topic.Version++;
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Conflict(); }
            return Results.Ok(topic);
        });
        api.MapPut("/goal", async (GoalRequest request, PlannerDbContext db, CancellationToken ct) =>
        {
            var errors = RequestValidation.ValidateSchedule(request.Title, request.StartsAt, request.DurationMinutes, request.Notes);
            if (string.IsNullOrWhiteSpace(request.Company) || request.Company.Length > 80) errors["company"] = ["Компания: от 1 до 80 символов."];
            if (errors.Count > 0) return Results.ValidationProblem(errors);
            var goal = await db.Goals.SingleAsync(ct);
            if (goal.Version != request.Version) return Conflict();
            goal.Company = request.Company!.Trim();
            goal.Title = request.Title!.Trim();
            goal.StartsAt = request.StartsAt.ToUniversalTime();
            goal.DurationMinutes = request.DurationMinutes;
            goal.Notes = request.Notes?.Trim() ?? "";
            goal.Version++;
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Conflict(); }
            return Results.Ok(goal);
        });
        api.MapGet("/export/calendar.ics", async (PlannerDbContext db, TimeProvider clock, CancellationToken ct) =>
            Results.File(CalendarExporter.Export(await db.Sessions.AsNoTracking().OrderBy(x => x.StartsAt).ToListAsync(ct),
                await db.Goals.AsNoTracking().SingleAsync(ct), clock.GetUtcNow()), "text/calendar; charset=utf-8", "rnx-study-plan.ics"));
        app.MapGet("/health", async (PlannerDbContext db, IDistributedCache cache, CancellationToken ct) =>
        {
            var database = false;
            var redis = false;
            try { database = await db.Database.CanConnectAsync(ct); } catch (Exception ex) when (ex is not OperationCanceledException) { }
            try { await cache.GetAsync("health", ct); redis = true; } catch (Exception ex) when (ex is not OperationCanceledException) { }
            return Results.Json(new { status = database ? (redis ? "healthy" : "degraded") : "unhealthy", database, redis }, statusCode: database ? 200 : 503);
        });
        api.Map("/{**path}", () => Results.NotFound());
    }

    private static IResult Conflict() => Results.Problem(statusCode: 409,
        title: "Данные уже изменены", detail: "Обновите страницу и повторите действие: запись изменена в другой вкладке.");
    private static void Apply(StudySession session, SessionRequest request)
    {
        session.Title = request.Title!.Trim();
        session.Track = request.Track!;
        session.Kind = request.Kind!;
        session.StartsAt = request.StartsAt.ToUniversalTime();
        session.DurationMinutes = request.DurationMinutes;
        session.Status = request.Status!;
        session.Notes = request.Notes?.Trim() ?? "";
        session.Outcome = request.Outcome?.Trim() ?? "";
        session.TopicId = request.TopicId;
    }
}
