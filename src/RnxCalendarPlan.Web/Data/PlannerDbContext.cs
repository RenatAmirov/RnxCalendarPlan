using Microsoft.EntityFrameworkCore;
using RnxCalendarPlan.Web.Domain;

namespace RnxCalendarPlan.Web.Data;

public sealed class PlannerDbContext(DbContextOptions<PlannerDbContext> options) : DbContext(options)
{
    public DbSet<StudySession> Sessions => Set<StudySession>();
    public DbSet<LearningTopic> Topics => Set<LearningTopic>();
    public DbSet<InterviewGoal> Goals => Set<InterviewGoal>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<StudySession>(entity =>
        {
            entity.Property(x => x.Title).HasMaxLength(160);
            entity.Property(x => x.Track).HasMaxLength(24);
            entity.Property(x => x.Kind).HasMaxLength(24);
            entity.Property(x => x.Status).HasMaxLength(24);
            entity.Property(x => x.Notes).HasMaxLength(8000);
            entity.Property(x => x.Outcome).HasMaxLength(1000);
            entity.Property(x => x.Version).IsConcurrencyToken();
            entity.HasIndex(x => x.StartsAt);
            entity.HasOne<LearningTopic>().WithMany().HasForeignKey(x => x.TopicId).OnDelete(DeleteBehavior.SetNull);
        });
        model.Entity<LearningTopic>(entity =>
        {
            entity.Property(x => x.Id).HasMaxLength(64);
            entity.Property(x => x.Title).HasMaxLength(160);
            entity.Property(x => x.Track).HasMaxLength(24);
            entity.Property(x => x.Notes).HasMaxLength(8000);
            entity.Property(x => x.Version).IsConcurrencyToken();
        });
        model.Entity<InterviewGoal>(entity =>
        {
            entity.Property(x => x.Company).HasMaxLength(80);
            entity.Property(x => x.Title).HasMaxLength(160);
            entity.Property(x => x.Notes).HasMaxLength(8000);
            entity.Property(x => x.Version).IsConcurrencyToken();
        });
    }
}
