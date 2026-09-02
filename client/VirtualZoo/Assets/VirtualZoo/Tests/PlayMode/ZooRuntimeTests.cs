using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using VirtualZoo.Domain;
using VirtualZoo.Presentation;

namespace VirtualZoo.Tests.PlayMode
{
    public sealed class ZooRuntimeTests
    {
        [UnitySetUp]
        public IEnumerator LoadScene()
        {
            var op = SceneManager.LoadSceneAsync("ZooGarden", LoadSceneMode.Single);
            Assert.That(op, Is.Not.Null);
            yield return op;
            yield return null;
        }

        [UnityTest]
        public IEnumerator Scene_loads_without_exception_and_spawns_twenty_creatures()
        {
            yield return new WaitForSeconds(0.2f);
            var director = Object.FindFirstObjectByType<ZooDirector>();
            Assert.That(director, Is.Not.Null);
            Assert.That(director.ActiveCount, Is.GreaterThanOrEqualTo(20));
        }

        [UnityTest]
        public IEnumerator Creatures_have_controller_and_visual_and_all_locomotion_classes()
        {
            yield return new WaitForSeconds(0.2f);
            var identities = Object.FindObjectsByType<CreatureIdentity>(FindObjectsSortMode.None);
            Assert.That(identities.Length, Is.GreaterThanOrEqualTo(20));
            int walk = 0, hop = 0, fly = 0, floater = 0;
            foreach (var identity in identities)
            {
                Assert.That(identity.GetComponent<CreatureMotor>(), Is.Not.Null);
                Assert.That(identity.GetComponent<CreaturePresentation>(), Is.Not.Null);
                Assert.That(identity.transform.Find("VisualRoot"), Is.Not.Null);
                switch (identity.Locomotion)
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

        [UnityTest]
        public IEnumerator Reinitialize_does_not_duplicate_creatures()
        {
            yield return new WaitForSeconds(0.1f);
            var director = Object.FindFirstObjectByType<ZooDirector>();
            int first = director.ActiveCount;
            director.Initialize();
            yield return null;
            yield return null;
            Assert.That(director.ActiveCount, Is.EqualTo(first));
            Assert.That(director.ActiveCount, Is.GreaterThanOrEqualTo(20));
        }

        [UnityTest]
        public IEnumerator After_simulation_creatures_stay_in_bounds_and_remain_active()
        {
            yield return new WaitForSeconds(6f);
            var director = Object.FindFirstObjectByType<ZooDirector>();
            Assert.That(director.ActiveCount, Is.GreaterThanOrEqualTo(20));
            foreach (var spawned in director.Spawned)
            {
                Assert.That(spawned, Is.Not.Null);
                Assert.That(director.IsInsideBounds(spawned.transform.position), Is.True, spawned.name);
            }
        }

        [UnityTest]
        public IEnumerator Repeated_reinitialize_releases_runtime_assets_and_leaves_twenty_active()
        {
            var warnings = new System.Collections.Generic.List<string>();
            var errors = new System.Collections.Generic.List<string>();
            UnityEngine.Application.LogCallback onLog = (condition, stack, type) =>
            {
                if (!string.IsNullOrEmpty(stack) && stack.Contains("UnityEditor.Search"))
                {
                    return;
                }

                if (type == LogType.Warning)
                {
                    warnings.Add(condition);
                }

                if (type == LogType.Error || type == LogType.Exception)
                {
                    errors.Add(condition);
                }
            };
            UnityEngine.Application.logMessageReceived += onLog;

            yield return new WaitForSeconds(0.2f);
            var director = Object.FindFirstObjectByType<ZooDirector>();
            Assert.That(director, Is.Not.Null);
            int owned = director.OwnedRuntimeAssetCount;
            Assert.That(owned, Is.GreaterThanOrEqualTo(80));
            for (int i = 0; i < 3; i++)
            {
                director.Initialize();
                yield return null;
                yield return null;
                yield return null;
            }

            yield return null;
            yield return null;

            Assert.That(director.ActiveCount, Is.EqualTo(20));
            Assert.That(director.CreatureRoot, Is.Not.Null);
            Assert.That(director.CreatureRoot.childCount, Is.EqualTo(20));
            foreach (Transform child in director.CreatureRoot)
            {
                Assert.That(child.gameObject.activeInHierarchy, Is.True, child.name);
                Assert.That(child.GetComponent<CreatureRuntimeAssets>(), Is.Not.Null);
            }

            Assert.That(director.OwnedRuntimeAssetCount, Is.EqualTo(owned));
            int live = CreatureRuntimeAssets.CountLiveRuntimeAssets();
            Assert.That(
                live,
                Is.EqualTo(director.OwnedRuntimeAssetCount),
                "Project-wide VZRuntime.* census after destroy frames must match owned assets, not only _spawned.");
            UnityEngine.Application.logMessageReceived -= onLog;
            Assert.That(errors, Is.Empty, string.Join("\n", errors));
            Assert.That(warnings, Is.Empty, string.Join("\n", warnings));
        }

        [UnityTest]
        public IEnumerator Garden_has_one_meadow_one_path_one_water_and_no_grass_mosaic()
        {
            yield return new WaitForSeconds(0.15f);
            Assert.That(CountNamed(GardenMeshFactory.MeadowName), Is.EqualTo(1));
            Assert.That(CountNamed(GardenMeshFactory.PathName), Is.EqualTo(1));
            Assert.That(CountNamed(GardenMeshFactory.WaterName), Is.EqualTo(1));
            Assert.That(CountNamed("ground_grass"), Is.EqualTo(0));
            Assert.That(CountNamed("MeadowDisc"), Is.EqualTo(0));
            Assert.That(CountNamed("ground_pathStraight"), Is.EqualTo(0));
            Assert.That(CountNamed("ground_pathBend"), Is.EqualTo(0));
            Assert.That(CountNamed("ground_riverTile"), Is.EqualTo(0));
        }

        [UnityTest]
        public IEnumerator Kenney_props_use_uniform_scale_and_meshes_are_finite()
        {
            yield return new WaitForSeconds(0.15f);
            var props = Object.FindObjectsByType<KenneyProp>(FindObjectsSortMode.None);
            Assert.That(props.Length, Is.GreaterThan(20));
            foreach (var prop in props)
            {
                Vector3 scale = prop.transform.localScale;
                float max = Mathf.Max(scale.x, Mathf.Max(scale.y, scale.z));
                float min = Mathf.Min(scale.x, Mathf.Min(scale.y, scale.z));
                Assert.That(
                    (max - min) / Mathf.Max(max, 0.0001f),
                    Is.LessThan(0.02f),
                    prop.name + " scale=" + scale);
            }

            string[] surfaces =
            {
                GardenMeshFactory.MeadowName,
                GardenMeshFactory.PathName,
                GardenMeshFactory.WaterName,
                GardenMeshFactory.BankName
            };
            for (int i = 0; i < surfaces.Length; i++)
            {
                var go = GameObject.Find(surfaces[i]);
                Assert.That(go, Is.Not.Null, surfaces[i]);
                var filter = go.GetComponent<MeshFilter>();
                Assert.That(filter, Is.Not.Null);
                Assert.That(filter.sharedMesh, Is.Not.Null);
                Bounds bounds = filter.sharedMesh.bounds;
                Assert.That(float.IsFinite(bounds.center.x) && float.IsFinite(bounds.center.y) && float.IsFinite(bounds.center.z), Is.True, surfaces[i]);
                Assert.That(bounds.size.sqrMagnitude, Is.GreaterThan(0.01f), surfaces[i]);
                if (filter.sharedMesh.isReadable)
                {
                    GardenMeshFactory.Validate(filter.sharedMesh);
                }
            }
        }

        [UnityTest]
        public IEnumerator Overview_shows_at_least_twelve_animals_fully_inside_the_frame()
        {
            yield return new WaitForSeconds(0.25f);
            var camera = Camera.main;
            Assert.That(camera, Is.Not.Null);
            var rig = Object.FindFirstObjectByType<ZooCameraRig>();
            if (rig != null)
            {
                rig.Freeze(true);
            }

            camera.fieldOfView = 32f;
            camera.aspect = 1600f / 1200f;
            camera.transform.SetPositionAndRotation(
                ZooLayout.OverviewCamera,
                Quaternion.LookRotation((ZooLayout.OverviewFocus - ZooLayout.OverviewCamera).normalized, Vector3.up));
            yield return null;

            Assert.That(CreatureViewport.CountFullyInside(camera, CreatureViewport.OverviewMargin), Is.GreaterThanOrEqualTo(12));
            Assert.That(CreatureViewport.AnyClipped(camera, CreatureViewport.OverviewMargin), Is.False);
            Assert.That(CreatureViewport.AnyDominant(camera, CreatureViewport.MaxOverviewHeight), Is.False);
        }

        static int CountNamed(string name)
        {
            int count = 0;
            var all = Object.FindObjectsByType<Transform>(FindObjectsInactive.Include, FindObjectsSortMode.None);
            for (int i = 0; i < all.Length; i++)
            {
                if (all[i].name == name)
                {
                    count++;
                }
            }

            return count;
        }
    }
}
