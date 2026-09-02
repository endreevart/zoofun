using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using VirtualZoo.Domain;
using VirtualZoo.Presentation;

namespace VirtualZoo.Tests.PlayMode
{
    public sealed class ArtDirectionRuntimeTests
    {
        [UnitySetUp]
        public IEnumerator LoadScene()
        {
            var op = SceneManager.LoadSceneAsync("ZooArtDirection", LoadSceneMode.Single);
            Assert.That(op, Is.Not.Null);
            yield return op;
            yield return null;
        }

        [UnityTest]
        public IEnumerator Hero_scene_spawns_six_to_eight_v2_creatures()
        {
            yield return new WaitForSeconds(0.25f);
            var director = Object.FindFirstObjectByType<ArtDirectionDirector>();
            Assert.That(director, Is.Not.Null);
            Assert.That(director.ActiveCount, Is.InRange(6, 8));

            var identities = Object.FindObjectsByType<CreatureIdentity>(FindObjectsSortMode.None);
            Assert.That(identities.Length, Is.EqualTo(director.ActiveCount));
            int walk = 0, hop = 0, fly = 0, floater = 0;
            foreach (var identity in identities)
            {
                Assert.That(identity.GetComponent<CreatureMotor>(), Is.Not.Null);
                Assert.That(identity.GetComponent<CreaturePresentationV2>(), Is.Not.Null);
                Assert.That(identity.GetComponent<CreaturePresentation>(), Is.Null);
                Assert.That(identity.transform.Find("VisualRoot"), Is.Not.Null);
                Assert.That(ArtLayout.IsHero(identity.CreatureId), Is.True);
                switch (identity.Locomotion)
                {
                    case LocomotionClass.Walk: walk++; break;
                    case LocomotionClass.Hop: hop++; break;
                    case LocomotionClass.Fly: fly++; break;
                    case LocomotionClass.Float: floater++; break;
                }
            }

            Assert.That(walk, Is.GreaterThanOrEqualTo(1));
            Assert.That(hop, Is.GreaterThanOrEqualTo(1));
            Assert.That(fly, Is.GreaterThanOrEqualTo(1));
            Assert.That(floater, Is.GreaterThanOrEqualTo(1));
        }

        [UnityTest]
        public IEnumerator Hero_environment_uses_premium_meshes_without_kenney_or_missing_assets()
        {
            yield return new WaitForSeconds(0.15f);
            Assert.That(Object.FindObjectsByType<KenneyProp>(FindObjectsSortMode.None).Length, Is.EqualTo(0));
            Assert.That(Object.FindObjectsByType<PremiumProp>(FindObjectsSortMode.None).Length, Is.GreaterThan(20));
            Assert.That(GameObject.Find("PondWater"), Is.Not.Null);
            Assert.That(GameObject.Find("Bridge"), Is.Not.Null);

            var filters = Object.FindObjectsByType<MeshFilter>(FindObjectsSortMode.None);
            int missing = 0;
            int missingMats = 0;
            for (int i = 0; i < filters.Length; i++)
            {
                if (filters[i].sharedMesh == null)
                {
                    missing++;
                }

                var renderer = filters[i].GetComponent<MeshRenderer>();
                if (renderer != null && renderer.enabled && (renderer.sharedMaterials == null || renderer.sharedMaterials.Length == 0 || renderer.sharedMaterials[0] == null))
                {
                    missingMats++;
                }
            }

            Assert.That(missing, Is.EqualTo(0));
            Assert.That(missingMats, Is.EqualTo(0));
        }
    }
}
