using NUnit.Framework;
using UnityEngine;
using VirtualZoo.Domain;
using VirtualZoo.Presentation;

namespace VirtualZoo.Tests.EditMode
{
    public sealed class HabitatZoneRegistryTests
    {
        [Test]
        public void Registry_updates_when_zones_are_created_and_destroyed()
        {
            int before = HabitatZone.RegisteredCount;
            HabitatZone created = null;
            var go = new GameObject("TempHabitatZone");
            try
            {
                created = go.AddComponent<HabitatZone>();
                created.Configure(HabitatKind.Ground, Vector3.one);
                Assert.That(HabitatZone.RegisteredCount, Is.EqualTo(before + 1));
                Assert.That(Contains(HabitatZone.FindAll(HabitatKind.Ground), created), Is.True);

                Object.DestroyImmediate(go);
                go = null;
                Assert.That(HabitatZone.RegisteredCount, Is.EqualTo(before));
                Assert.That(Contains(HabitatZone.FindAll(HabitatKind.Ground), created), Is.False);

                go = new GameObject("TempHabitatZone2");
                var second = go.AddComponent<HabitatZone>();
                second.Configure(HabitatKind.Water, new Vector3(2f, 1f, 2f));
                Assert.That(Contains(HabitatZone.FindAll(HabitatKind.Water), second), Is.True);
                Assert.That(HabitatZone.RegisteredCount, Is.EqualTo(before + 1));

                Object.DestroyImmediate(go);
                go = null;
                Assert.That(Contains(HabitatZone.FindAll(HabitatKind.Water), second), Is.False);
                Assert.That(HabitatZone.RegisteredCount, Is.EqualTo(before));
            }
            finally
            {
                if (go != null)
                {
                    Object.DestroyImmediate(go);
                }
            }
        }

        static bool Contains(HabitatZone[] zones, HabitatZone target)
        {
            if (target == null)
            {
                return false;
            }

            for (int i = 0; i < zones.Length; i++)
            {
                if (zones[i] == target)
                {
                    return true;
                }
            }

            return false;
        }
    }
}
