FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /source
COPY Directory.Build.props global.json ./
COPY src/RnxCalendarPlan.Web/RnxCalendarPlan.Web.csproj src/RnxCalendarPlan.Web/
RUN dotnet restore src/RnxCalendarPlan.Web/RnxCalendarPlan.Web.csproj
COPY src/ src/
RUN dotnet publish src/RnxCalendarPlan.Web -c Release -o /app --no-restore /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build --chown=app:app /app .
RUN mkdir -p /app/logs && chown -R app:app /app/logs
USER app
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "RnxCalendarPlan.Web.dll"]
