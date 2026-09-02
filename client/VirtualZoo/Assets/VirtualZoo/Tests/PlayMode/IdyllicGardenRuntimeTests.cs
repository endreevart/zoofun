using System.Collections;
using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using VirtualZoo.Domain;
using VirtualZoo.Presentation;

namespace VirtualZoo.Tests.PlayMode
{
    public sealed class IdyllicGardenRuntimeTests
    {
        [UnitySetUp]
        public IEnumerator LoadScene()
        {
            var op = SceneManager.LoadSceneAsync(IdyllicLayout.SceneName, LoadSceneMode.Single);
            Assert.That(op, Is.Not.Null);
            yield return op;
            yield return null;
        }

        [UnityTest]
        public IEnumerator Scene_loads_and_spawns_twenty_unique_creatures()
        {
            yield return new WaitForSeconds(0.25f);
            Assert.That(SceneManager.GetActiveScene().name, Is.EqualTo(IdyllicLayout.SceneName));
            var director = Object.FindFirstObjectByType<ZooDirector>();
            Assert.That(director, Is.Not.Null);
            Assert.That(director.ActiveCount, Is.EqualTo(20));
            Assert.That(director.UsesCardPresentation, Is.True);

            var ids = new HashSet<string>();
            var identities = Object.FindObjectsByType<CreatureIdentity>(FindObjectsSortMode.None);
            Assert.That(identities.Length, Is.EqualTo(20));
            int walk = 0, hop = 0, fly = 0, floater = 0;
            foreach (var identity in identities)
            {
                Assert.That(identity.gameObject.activeInHierarchy, Is.True, identity.name);
                Assert.That(identity.GetComponent<CreatureMotor>(), Is.Not.Null);
                Assert.That(identity.GetComponent<CreaturePresentationV2>(), Is.Not.Null);
                Assert.That(identity.GetComponent<CreaturePresentation>(), Is.Null);
                Assert.That(identity.transform.Find("VisualRoot"), Is.Not.Null);
                Assert.That(ids.Add(identity.CreatureId), Is.True, identity.CreatureId);
                switch (identity.Locomotion)
                {
                    case LocomotionClass.Walk: walk++; break;
                    case LocomotionClass.Hop: hop++; break;
                    case LocomotionClass.Fly: fly++; break;
                    case LocomotionClass.Float: floater++; break;
                }
            }

            Assert.That(walk, Is.EqualTo(8));
            Assert.That(hop, Is.EqualTo(4));
            Assert.That(fly, Is.EqualTo(4));
            Assert.That(floater, Is.EqualTo(4));
        }

        [UnityTest]
        public IEnumerator Habitat_zones_exist_and_are_not_bound_to_vendor_names()
        {
            yield return new WaitForSeconds(0.1f);
            Assert.That(GameObject.Find("GroundZone"), Is.Not.Null);
            Assert.That(GameObject.Find("HopZone"), Is.Not.Null);
            Assert.That(GameObject.Find("FlightZone"), Is.Not.Null);
            Assert.That(GameObject.Find("WaterZone"), Is.Not.Null);
            Assert.That(HabitatZone.Find(HabitatKind.Ground), Is.Not.Null);
            Assert.That(HabitatZone.Find(HabitatKind.Hop), Is.Not.Null);
            Assert.That(HabitatZone.Find(HabitatKind.Flight), Is.Not.Null);
            Assert.That(HabitatZone.Find(HabitatKind.Water), Is.Not.Null);
            Assert.That(HabitatZone.FindAll(HabitatKind.Spawn).Length, Is.GreaterThanOrEqualTo(4));
        }

        [UnityTest]
        public IEnumerator Habitat_zone_registry_updates_on_create_and_destroy()
        {
            yield return new WaitForSeconds(0.1f);
            int before = HabitatZone.RegisteredCount;
            Assert.That(HabitatZone.Find(HabitatKind.Ground), Is.Not.Null);
            var go = new GameObject("TempHabitatZone");
            var zone = go.AddComponent<HabitatZone>();
            zone.Configure(HabitatKind.Ground, Vector3.one);
            Assert.That(HabitatZone.RegisteredCount, Is.EqualTo(before + 1));
            bool found = false;
            var all = HabitatZone.FindAll(HabitatKind.Ground);
            for (int i = 0; i < all.Length; i++)
            {
                if (all[i] == zone)
                {
                    found = true;
                    break;
                }
            }

            Assert.That(found, Is.True);
            Object.Destroy(go);
            yield return null;
            Assert.That(HabitatZone.RegisteredCount, Is.EqualTo(before));
            Assert.That(HabitatZone.Find(HabitatKind.Ground), Is.Not.Null);
        }

        [UnityTest]
        public IEnumerator Materials_meshes_and_textures_are_present_with_working_shaders()
        {
            yield return new WaitForSeconds(0.15f);
            var renderers = Object.FindObjectsByType<Renderer>(FindObjectsInactive.Exclude, FindObjectsSortMode.None);
            int broken = 0;
            int missingMesh = 0;
            int missingMat = 0;
            for (int i = 0; i < renderers.Length; i++)
            {
                if (!renderers[i].enabled)
                {
                    continue;
                }

                var mats = renderers[i].sharedMaterials;
                if (mats == null || mats.Length == 0 || mats[0] == null)
                {
                    missingMat++;
                    continue;
                }

                for (int m = 0; m < mats.Length; m++)
                {
                    if (mats[m] == null || mats[m].shader == null || mats[m].shader.name.Contains("InternalError"))
                    {
                        broken++;
                    }
                }

                var filter = renderers[i].GetComponent<MeshFilter>();
                if (filter != null && filter.sharedMesh == null)
                {
                    missingMesh++;
                }

                var sprite = renderers[i] as SpriteRenderer;
                if (sprite != null && sprite.sprite == null)
                {
                    missingMesh++;
                }
            }

            Assert.That(broken, Is.EqualTo(0));
            Assert.That(missingMesh, Is.EqualTo(0));
            Assert.That(missingMat, Is.EqualTo(0));
        }

        [UnityTest]
        public IEnumerator After_simulation_creatures_stay_in_habitat_zones()
        {
            yield return new WaitForSeconds(6f);
            var director = Object.FindFirstObjectByType<ZooDirector>();
            Assert.That(director, Is.Not.Null);
            Assert.That(director.ActiveCount, Is.EqualTo(20));
            var identities = Object.FindObjectsByType<CreatureIdentity>(FindObjectsSortMode.None);
            foreach (var identity in identities)
            {
                Assert.That(identity.gameObject.activeInHierarchy, Is.True, identity.name);
                Assert.That(
                    director.IsInsideHabitat(identity.Locomotion, identity.transform.position),
                    Is.True,
                    identity.name + " " + identity.Locomotion + " at " + identity.transform.position);
                if (identity.Locomotion == LocomotionClass.Walk || identity.Locomotion == LocomotionClass.Hop)
                {
                    Assert.That(identity.transform.position.y, Is.GreaterThan(-0.15f));
                    Assert.That(identity.transform.position.y, Is.LessThan(0.8f));
                }

                if (identity.Locomotion == LocomotionClass.Fly)
                {
                    Assert.That(identity.transform.position.y, Is.GreaterThan(1.1f));
                }

                if (identity.Locomotion == LocomotionClass.Float)
                {
                    Assert.That(identity.transform.position.y, Is.GreaterThan(0.02f));
                    Assert.That(HabitatZone.Find(HabitatKind.Water).Contains(identity.transform.position, 1.8f), Is.True);
                }
            }
        }

        [UnityTest]
        public IEnumerator Repeated_initialize_releases_runtime_assets()
        {
            var warnings = new List<string>();
            var errors = new List<string>();
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
            Assert.That(director.CreatureRoot.childCount, Is.EqualTo(20));
            Assert.That(director.OwnedRuntimeAssetCount, Is.EqualTo(owned));
            Assert.That(CreatureRuntimeAssets.CountLiveRuntimeAssets(), Is.EqualTo(director.OwnedRuntimeAssetCount));
            UnityEngine.Application.logMessageReceived -= onLog;
            Assert.That(errors, Is.Empty, string.Join("\n", errors));
            Assert.That(warnings, Is.Empty, string.Join("\n", warnings));
        }

        [UnityTest]
        public IEnumerator Overview_camera_fits_twelve_animals_in_16x9_and_4x3()
        {
            yield return new WaitForSeconds(0.3f);
            var camera = Camera.main;
            var rig = Object.FindFirstObjectByType<ZooCameraRig>();
            if (rig != null)
            {
                rig.Freeze(true);
            }

            camera.fieldOfView = IdyllicLayout.CameraFov;
            camera.aspect = 1600f / 1200f;
            camera.transform.SetPositionAndRotation(
                IdyllicLayout.HeroCamera,
                Quaternion.LookRotation((IdyllicLayout.HeroFocus - IdyllicLayout.HeroCamera).normalized, Vector3.up));
            yield return null;
            Assert.That(CreatureViewport.CountFullyInside(camera, CreatureViewport.OverviewMargin), Is.GreaterThanOrEqualTo(12));

            camera.aspect = 1920f / 1080f;
            camera.transform.SetPositionAndRotation(
                IdyllicLayout.HeroCamera,
                Quaternion.LookRotation((IdyllicLayout.HeroFocus - IdyllicLayout.HeroCamera).normalized, Vector3.up));
            yield return null;
            Assert.That(CreatureViewport.CountFullyInside(camera, CreatureViewport.OverviewMargin), Is.GreaterThanOrEqualTo(12));
        }

        [UnityTest]
        public IEnumerator Scene_has_no_kenney_or_visible_placeholder_primitives()
        {
            yield return new WaitForSeconds(0.15f);
            Assert.That(Object.FindObjectsByType<KenneyProp>(FindObjectsSortMode.None).Length, Is.EqualTo(0));
            Assert.That(Object.FindObjectsByType<IdyllicProp>(FindObjectsSortMode.None).Length, Is.GreaterThan(20));
            Assert.That(GameObject.Find("Bridge"), Is.Not.Null);
            Assert.That(GameObject.Find("ZooGate"), Is.Not.Null);
            Assert.That(GameObject.Find(GardenMeshFactory.WaterName), Is.Not.Null);

            int visiblePrimitives = 0;
            var filters = Object.FindObjectsByType<MeshFilter>(FindObjectsSortMode.None);
            for (int i = 0; i < filters.Length; i++)
            {
                var renderer = filters[i].GetComponent<MeshRenderer>();
                if (renderer == null || !renderer.enabled)
                {
                    continue;
                }

                string name = filters[i].gameObject.name;
                if (name == "Ground" || name == "ContactShadow" || name == "PondObstacle")
                {
                    continue;
                }

                Mesh mesh = filters[i].sharedMesh;
                if (mesh != null && IsBuiltinPrimitive(mesh.name))
                {
                    visiblePrimitives++;
                }
            }

            Assert.That(visiblePrimitives, Is.EqualTo(0));
        }

        [UnityTest]
        public IEnumerator Cards_face_the_gameplay_camera()
        {
            yield return new WaitForSeconds(0.35f);
            var camera = Camera.main;
            Assert.That(camera, Is.Not.Null);
            var identities = Object.FindObjectsByType<CreatureIdentity>(FindObjectsSortMode.None);
            int facing = 0;
            for (int i = 0; i < identities.Length; i++)
            {
                var sway = identities[i].transform.Find("VisualRoot/SwayRoot");
                Assert.That(sway, Is.Not.Null, identities[i].name);
                Vector3 toCam = camera.transform.position - identities[i].transform.position;
                if (toCam.sqrMagnitude < 0.0001f)
                {
                    continue;
                }

                float align = Vector3.Dot(sway.forward, toCam.normalized);
                if (align > 0.45f)
                {
                    facing++;
                }
            }

            Assert.That(facing, Is.EqualTo(identities.Length));
        }

        [UnityTest]
        public IEnumerator Pond_and_bridge_share_the_water()
        {
            yield return new WaitForSeconds(0.15f);
            var water = GameObject.Find(GardenMeshFactory.WaterName);
            var bridge = GameObject.Find("Bridge");
            var near = GameObject.Find("BridgeAbutmentNear");
            var far = GameObject.Find("BridgeAbutmentFar");
            Assert.That(water, Is.Not.Null);
            Assert.That(bridge, Is.Not.Null);
            Assert.That(near, Is.Not.Null);
            Assert.That(far, Is.Not.Null);
            Vector3 pond = IdyllicLayout.PondCenter;
            var bridgeRenderer = bridge.GetComponentInChildren<MeshRenderer>();
            Assert.That(bridgeRenderer, Is.Not.Null);
            Bounds bounds = bridgeRenderer.bounds;
            float bridgeDist = Vector2.Distance(
                new Vector2(bounds.center.x, bounds.center.z),
                new Vector2(pond.x, pond.z));
            Assert.That(bridgeDist, Is.LessThan(IdyllicLayout.PondExtents.x + 0.8f));
            Assert.That(bounds.min.y, Is.LessThan(0.35f));
            var nearBounds = EncapsulateRenderers(near);
            var farBounds = EncapsulateRenderers(far);
            Assert.That(nearBounds.min.y, Is.LessThan(0.2f));
            Assert.That(farBounds.min.y, Is.LessThan(0.2f));
            Vector3 nearOff = new Vector3(nearBounds.center.x - pond.x, 0f, nearBounds.center.z - pond.z);
            Vector3 farOff = new Vector3(farBounds.center.x - pond.x, 0f, farBounds.center.z - pond.z);
            Assert.That(Vector3.Dot(nearOff, farOff), Is.LessThan(0f));
            Assert.That(nearOff.magnitude, Is.GreaterThan(0.65f));
            Assert.That(farOff.magnitude, Is.GreaterThan(0.65f));
            Vector3 across = farOff - nearOff;
            Assert.That(across.magnitude, Is.GreaterThan(1.85f));
            Assert.That(
                GardenMeshFactory.IsInsidePond(
                    new Vector3(bounds.center.x, 0f, bounds.center.z),
                    pond,
                    IdyllicLayout.PondExtents,
                    0.45f),
                Is.True);
        }

        [UnityTest]
        public IEnumerator Gate_has_supports_and_an_opening()
        {
            yield return new WaitForSeconds(0.15f);
            var gate = GameObject.Find("ZooGate");
            var left = GameObject.Find("GatePillarL");
            var right = GameObject.Find("GatePillarR");
            Assert.That(gate, Is.Not.Null);
            Assert.That(left, Is.Not.Null);
            Assert.That(right, Is.Not.Null);
            var gateBounds = EncapsulateRenderers(gate);
            Assert.That(gateBounds.min.y, Is.LessThan(0.15f));
            Assert.That(gateBounds.size.y, Is.GreaterThan(2.8f));
            Assert.That(gateBounds.size.x, Is.GreaterThan(4.2f));
            Assert.That(gateBounds.size.z, Is.GreaterThan(0.7f));
            var leftBounds = EncapsulateRenderers(left);
            var rightBounds = EncapsulateRenderers(right);
            Assert.That(leftBounds.min.y, Is.LessThan(0.2f));
            Assert.That(rightBounds.min.y, Is.LessThan(0.2f));
            Assert.That(leftBounds.max.y, Is.GreaterThan(0.55f));
            Assert.That(rightBounds.max.y, Is.GreaterThan(0.55f));
            float opening = Vector2.Distance(
                new Vector2(left.transform.position.x, left.transform.position.z),
                new Vector2(right.transform.position.x, right.transform.position.z));
            Assert.That(opening, Is.InRange(1.8f, 3.4f));
        }

        [UnityTest]
        public IEnumerator Spacing_registry_has_no_duplicates_after_reinitialize()
        {
            yield return new WaitForSeconds(0.2f);
            var director = Object.FindFirstObjectByType<ZooDirector>();
            Assert.That(director, Is.Not.Null);
            for (int i = 0; i < 3; i++)
            {
                director.Initialize();
                yield return null;
                yield return null;
            }

            yield return null;
            Assert.That(director.ActiveCount, Is.EqualTo(20));
            Assert.That(CreatureSpacingRegistry.Count, Is.EqualTo(20));
            Assert.That(CreatureSpacingRegistry.HasDuplicates(), Is.False);
        }

        [UnityTest]
        public IEnumerator Creatures_keep_a_readable_spawn_interval()
        {
            yield return new WaitForSeconds(0.35f);
            var identities = Object.FindObjectsByType<CreatureIdentity>(FindObjectsSortMode.None);
            for (int i = 0; i < identities.Length; i++)
            {
                for (int j = i + 1; j < identities.Length; j++)
                {
                    if (identities[i].Locomotion != identities[j].Locomotion)
                    {
                        continue;
                    }

                    Vector3 delta = identities[i].transform.position - identities[j].transform.position;
                    if (identities[i].Locomotion != LocomotionClass.Fly)
                    {
                        delta.y = 0f;
                    }

                    Assert.That(delta.magnitude, Is.GreaterThan(0.85f), identities[i].name + " vs " + identities[j].name);
                }
            }
        }

        static Bounds EncapsulateRenderers(GameObject go)
        {
            var renderers = go.GetComponentsInChildren<Renderer>();
            Assert.That(renderers.Length, Is.GreaterThan(0));
            Bounds bounds = renderers[0].bounds;
            for (int i = 1; i < renderers.Length; i++)
            {
                bounds.Encapsulate(renderers[i].bounds);
            }

            return bounds;
        }

        static bool IsBuiltinPrimitive(string meshName)
        {
            return meshName == "Cube" || meshName == "Sphere" || meshName == "Capsule" ||
                   meshName == "Plane" || meshName == "Quad" || meshName == "Cylinder";
        }
    }
}
