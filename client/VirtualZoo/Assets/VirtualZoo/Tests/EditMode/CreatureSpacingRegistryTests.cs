using NUnit.Framework;
using UnityEngine;
using VirtualZoo.Presentation;

namespace VirtualZoo.Tests.EditMode
{
    public sealed class CreatureSpacingRegistryTests
    {
        [Test]
        public void Registry_rejects_duplicate_registration_and_clears()
        {
            CreatureSpacingRegistry.Clear();
            var first = new GameObject("SpacingA").AddComponent<CreatureIdentity>();
            var second = new GameObject("SpacingB").AddComponent<CreatureIdentity>();
            try
            {
                CreatureSpacingRegistry.Register(first);
                CreatureSpacingRegistry.Register(first);
                CreatureSpacingRegistry.Register(second);
                Assert.That(CreatureSpacingRegistry.Count, Is.EqualTo(2));
                Assert.That(CreatureSpacingRegistry.HasDuplicates(), Is.False);
                CreatureSpacingRegistry.Clear();
                Assert.That(CreatureSpacingRegistry.Count, Is.EqualTo(0));
                CreatureSpacingRegistry.Register(first);
                CreatureSpacingRegistry.Register(second);
                Assert.That(CreatureSpacingRegistry.Count, Is.EqualTo(2));
            }
            finally
            {
                CreatureSpacingRegistry.Clear();
                Object.DestroyImmediate(first.gameObject);
                Object.DestroyImmediate(second.gameObject);
            }
        }
    }
}
