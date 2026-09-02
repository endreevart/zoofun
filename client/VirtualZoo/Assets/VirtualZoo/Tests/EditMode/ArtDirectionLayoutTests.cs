using NUnit.Framework;
using VirtualZoo.Presentation;

namespace VirtualZoo.Tests.EditMode
{
    public sealed class ArtDirectionLayoutTests
    {
        [Test]
        public void Hero_roster_has_eight_named_fixtures()
        {
            Assert.That(ArtLayout.HeroCreatureIds.Length, Is.EqualTo(8));
            Assert.That(ArtLayout.IsHero("berry-elephant"), Is.True);
            Assert.That(ArtLayout.IsHero("a18c0001-7e2b-4c11-91a0-000000000001"), Is.True);
            Assert.That(ArtLayout.IsHero("butter-rabbit"), Is.True);
            Assert.That(ArtLayout.IsHero("honey-bee"), Is.True);
            Assert.That(ArtLayout.IsHero("coral-fish"), Is.True);
            Assert.That(ArtLayout.IsHero("clover-cow"), Is.False);
        }

        [Test]
        public void Hero_camera_uses_cinematic_fov()
        {
            Assert.That(ArtLayout.HeroFov, Is.InRange(30f, 40f));
            Assert.That(ArtLayout.HeroCamera.y, Is.GreaterThan(2.5f));
            Assert.That(ArtLayout.WaterHeight, Is.GreaterThan(0.02f));
        }
    }
}
