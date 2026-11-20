using Microsoft.EntityFrameworkCore;
using NLog.Web;
using RnxCalendarPlan.Web.Data;
using RnxCalendarPlan.Web.Features;

// The runtime image has no curl; probe the real HTTP readiness endpoint using .NET.
if (args is ["--health-check"])
{
    using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(4) };
    try
    {
        using var response = await client.GetAsync("http://127.0.0.1:8080/health");
        return response.IsSuccessStatusCode ? 0 : 1;
    }
    catch (HttpRequestException) { return 1; }
    catch (TaskCanceledException) { return 1; }
}

var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: false).AddEnvironmentVariables();
builder.Logging.ClearProviders();
builder.Host.UseNLog();
builder.Services.AddProblemDetails();
builder.Services.AddDbContext<PlannerDbContext>(options => options.UseNpgsql(
    builder.Configuration.GetConnectionString("Postgres") ?? throw new InvalidOperationException("ConnectionStrings:Postgres is required.")));
builder.Services.AddStackExchangeRedisCache(options =>
{
    options.Configuration = builder.Configuration.GetConnectionString("Redis");
    options.InstanceName = "rnx-calendar:";
});
builder.Services.AddSingleton<PromptCatalog>();
builder.Services.AddSingleton(TimeProvider.System);

var app = builder.Build();
app.UseExceptionHandler();
app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    context.Response.Headers["Content-Security-Policy"] =
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
        "connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
    if (context.Request.Path.StartsWithSegments("/api"))
    {
        context.Response.Headers.CacheControl = "no-store";
        if (!HttpMethods.IsGet(context.Request.Method) && context.Request.Headers["Sec-Fetch-Site"] == "cross-site")
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return;
        }
    }
    await next(context);
});
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapPlannerApi();
app.MapFallbackToFile("index.html");

if (app.Configuration.GetValue("Database:MigrateOnStartup", true))
{
    await using var scope = app.Services.CreateAsyncScope();
    var db = scope.ServiceProvider.GetRequiredService<PlannerDbContext>();
    await db.Database.MigrateAsync();
    await SeedData.InitializeAsync(db);
}
app.Run();
return 0;

public partial class Program;
