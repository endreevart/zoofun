using System.Collections.Generic;
using System.IO;
using NUnit.Framework;
using VirtualZoo.Application;
using VirtualZoo.Domain;
using VirtualZoo.Infrastructure;

namespace VirtualZoo.Tests.EditMode
{
    public sealed class FixtureManifestTests
    {
        static string FixturesRoot => FileFixtureCatalog.DefaultEditorRoot;

        [Test]
        public void Loads_all_twenty_valid_manifests()
        {
            var catalog = new FileFixtureCatalog(FixturesRoot);
            var loaded = catalog.LoadValidFixtures();
            Assert.That(loaded.Count, Is.GreaterThanOrEqualTo(20));
        }

        [Test]
        public void Creature_ids_are_unique()
        {
            var loaded = new FileFixtureCatalog(FixturesRoot).LoadValidFixtures();
            var ids = new List<string>();
            foreach (var fixture in loaded)
            {
                ids.Add(fixture.Manifest.CreatureId);
            }

            Assert.That(UniqueIdGuard.AllUnique(ids), Is.True);
            Assert.That(ids.Count, Is.GreaterThanOrEqualTo(20));
        }

        [Test]
        public void Png_files_exist_for_every_manifest()
        {
            var loaded = new FileFixtureCatalog(FixturesRoot).LoadValidFixtures();
            foreach (var fixture in loaded)
            {
                Assert.That(fixture.PngBytes, Is.Not.Null.And.Length.GreaterThan(32));
                Assert.That(File.Exists(Path.Combine(fixture.DirectoryPath, fixture.Manifest.TextureFileName)));
            }
        }

        [Test]
        public void Locomotion_classes_are_allowed_and_complete()
        {
            var loaded = new FileFixtureCatalog(FixturesRoot).LoadValidFixtures();
            int walk = 0, hop = 0, fly = 0, floater = 0;
            foreach (var fixture in loaded)
            {
                switch (fixture.Manifest.Locomotion)
                {
                    case LocomotionClass.Walk: walk++; break;
                    case LocomotionClass.Hop: hop++; break;
                    case LocomotionClass.Fly: fly++; break;
                    case LocomotionClass.Float: floater++; break;
                }
            }

            Assert.That(walk, Is.GreaterThanOrEqualTo(8));
            Assert.That(hop, Is.GreaterThanOrEqualTo(4));
            Assert.That(fly, Is.GreaterThanOrEqualTo(4));
            Assert.That(floater, Is.GreaterThanOrEqualTo(4));
        }

        [Test]
        public void Scale_and_anchor_stay_in_bounds()
        {
            var loaded = new FileFixtureCatalog(FixturesRoot).LoadValidFixtures();
            foreach (var fixture in loaded)
            {
                var result = CreatureManifestValidator.Validate(fixture.Manifest, true);
                Assert.That(result.IsValid, Is.True, result.Error);
            }
        }

        [Test]
        public void Unknown_locomotion_is_rejected()
        {
            const string json = @"{
  ""schemaVersion"": 1,
  ""creatureId"": ""bad"",
  ""revision"": 1,
  ""displayName"": ""Bad"",
  ""locomotion"": ""teleport"",
  ""scaleClass"": ""medium"",
  ""scale"": 1.0,
  ""moveSpeed"": 1.0,
  ""turnSpeed"": 180,
  ""groundAnchor"": { ""x"": 0.5, ""y"": 0.08 },
  ""assets"": { ""texture"": { ""path"": ""creature.png"", ""sha256"": ""0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"" } }
}";
            bool parsed = ManifestJson.TryParse(json, out _, out var error);
            Assert.That(parsed, Is.False);
            Assert.That(error, Does.Contain("Unknown locomotion"));
        }

        [Test]
        public void Missing_texture_is_rejected()
        {
            var manifest = new CreatureManifest(
                1,
                "missing-tex",
                1,
                "Missing",
                LocomotionClass.Walk,
                "medium",
                new GroundAnchor(0.5f, 0.08f),
                1f,
                1f,
                180f,
                "creature.png",
                "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
            var result = CreatureManifestValidator.Validate(manifest, false);
            Assert.That(result.IsValid, Is.False);
            Assert.That(result.Error, Does.Contain("texture"));
        }

        [Test]
        public void Seeded_route_selection_is_reproducible()
        {
            int a = SeededRouteSelector.SelectIndex(42, "a18c0001-7e2b-4c11-91a0-000000000001", 8);
            int b = SeededRouteSelector.SelectIndex(42, "a18c0001-7e2b-4c11-91a0-000000000001", 8);
            int c = SeededRouteSelector.SelectIndex(43, "a18c0001-7e2b-4c11-91a0-000000000001", 8);
            Assert.That(a, Is.EqualTo(b));
            Assert.That(a, Is.GreaterThanOrEqualTo(0).And.LessThan(8));
            Assert.That(c, Is.GreaterThanOrEqualTo(0).And.LessThan(8));
        }
    }
}
