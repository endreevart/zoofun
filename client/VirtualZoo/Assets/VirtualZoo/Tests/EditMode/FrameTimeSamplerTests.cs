using NUnit.Framework;
using VirtualZoo.Domain;

namespace VirtualZoo.Tests.EditMode
{
    public sealed class FrameTimeSamplerTests
    {
        [Test]
        public void Sixty_fps_sequence_has_no_below_thirty_and_expected_percentiles()
        {
            var sampler = new FrameTimeSampler(0f);
            sampler.Begin(1000, 0f);
            const float dt = 1f / 60f;
            for (int i = 0; i < 60; i++)
            {
                sampler.SampleFrame((i + 1) * dt, dt, 1000);
            }

            var report = sampler.Finish();
            Assert.That(report.TotalGameplayFrames, Is.EqualTo(60));
            Assert.That(report.SampleCount, Is.EqualTo(60));
            Assert.That(report.SampleCount, Is.LessThanOrEqualTo(report.TotalGameplayFrames));
            Assert.That(report.FpsAverage, Is.EqualTo(60f).Within(0.05f));
            Assert.That(report.FpsMin, Is.EqualTo(60f).Within(0.05f));
            Assert.That(report.SecondsBelow30Fps, Is.EqualTo(0f));
            Assert.That(report.LongestBelow30StreakSeconds, Is.EqualTo(0f));
            Assert.That(report.FrameMsP50, Is.EqualTo(1000f / 60f).Within(0.05f));
            Assert.That(report.FrameMsP95, Is.EqualTo(1000f / 60f).Within(0.05f));
            Assert.That(report.FrameMsP99, Is.EqualTo(1000f / 60f).Within(0.05f));
            Assert.That(report.SecondsBelow30Fps, Is.LessThanOrEqualTo(report.SoakSeconds));
        }

        [Test]
        public void Mixed_sequence_counts_real_time_below_thirty_and_longest_streak()
        {
            var sampler = new FrameTimeSampler(0f);
            sampler.Begin(2000, 0f);
            float t = 0f;
            for (int i = 0; i < 10; i++)
            {
                t += 1f / 60f;
                sampler.SampleFrame(t, 1f / 60f, 2000);
            }

            for (int i = 0; i < 5; i++)
            {
                t += 1f / 20f;
                sampler.SampleFrame(t, 1f / 20f, 2000);
            }

            for (int i = 0; i < 8; i++)
            {
                t += 1f / 60f;
                sampler.SampleFrame(t, 1f / 60f, 2000);
            }

            for (int i = 0; i < 3; i++)
            {
                t += 1f / 15f;
                sampler.SampleFrame(t, 1f / 15f, 2000);
            }

            var report = sampler.Finish();
            Assert.That(report.SecondsBelow30Fps, Is.EqualTo(5f / 20f + 3f / 15f).Within(0.0001f));
            Assert.That(report.LongestBelow30StreakSeconds, Is.EqualTo(5f / 20f).Within(0.0001f));
            Assert.That(report.FpsMin, Is.EqualTo(15f).Within(0.05f));
            Assert.That(report.FrameMsP50, Is.GreaterThan(10f));
            Assert.That(report.FrameMsP95, Is.GreaterThanOrEqualTo(report.FrameMsP50));
            Assert.That(report.FrameMsP99, Is.GreaterThanOrEqualTo(report.FrameMsP95));
            Assert.That(report.FrameMsMax, Is.EqualTo(1000f / 15f).Within(0.05f));
            Assert.That(report.SecondsBelow30Fps, Is.LessThanOrEqualTo(report.SoakSeconds));
        }

        [Test]
        public void Warmup_frames_are_counted_but_excluded_from_metrics()
        {
            var sampler = new FrameTimeSampler(5f);
            sampler.Begin(3000, 0f);
            float t = 0f;
            for (int i = 0; i < 5; i++)
            {
                t += 1f;
                sampler.SampleFrame(t, 1f, 3000);
            }

            for (int i = 0; i < 10; i++)
            {
                t += 1f / 60f;
                sampler.SampleFrame(t, 1f / 60f, 3000);
            }

            var report = sampler.Finish();
            Assert.That(report.TotalGameplayFrames, Is.EqualTo(15));
            Assert.That(report.SampleCount, Is.EqualTo(10));
            Assert.That(report.FpsMin, Is.EqualTo(60f).Within(0.05f));
            Assert.That(report.SecondsBelow30Fps, Is.EqualTo(0f));
        }

        [Test]
        public void Seconds_below_thirty_cannot_exceed_elapsed_duration()
        {
            var sampler = new FrameTimeSampler(0f);
            sampler.Begin(4000, 10f);
            for (int i = 0; i < 8; i++)
            {
                sampler.SampleFrame(11f, 2f, 4000);
            }

            var report = sampler.Finish();
            Assert.That(report.SoakSeconds, Is.EqualTo(1f).Within(0.0001f));
            Assert.That(report.SecondsBelow30Fps, Is.LessThanOrEqualTo(report.SoakSeconds));
            Assert.That(report.SecondsBelow30Fps, Is.GreaterThanOrEqualTo(0f));
            Assert.That(report.LongestBelow30StreakSeconds, Is.LessThanOrEqualTo(report.SoakSeconds));
        }
    }
}
