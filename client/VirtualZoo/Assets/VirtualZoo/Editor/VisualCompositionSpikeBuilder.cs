using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.AI;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using VirtualZoo.Application;
using VirtualZoo.Domain;
using VirtualZoo.Infrastructure;
using VirtualZoo.Presentation;

namespace VirtualZoo.EditorTools
{
    public static class VisualCompositionSpikeBuilder
    {
        public const string ScenePath = VisualCompositionSpikeRunner.ScenePath;

        static readonly List<GameObject> Hidden = new List<GameObject>();

        public static void Build()
        {
            VisualCompositionSpikeRunner.EnsureArtFolder();
            CopyPipeline();
            VisualHeroSpikeRunner.ApplyUrp(VisualHeroSpikeRunner.DemoUrpPath);

            var demo = EditorSceneManager.OpenScene(VisualHeroSpikeRunner.DemoScenePath, OpenSceneMode.Single);
            var lighting = CaptureLighting();
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Additive);
            EditorSceneManager.SetActiveScene(scene);

            var roots = demo.GetRootGameObjects();
            for (int i = 0; i < roots.Length; i++)
            {
                if (roots[i].name == "Controls")
                {
                    continue;
                }

                var copy = Object.Instantiate(roots[i]);
                copy.name = roots[i].name;
                EditorSceneManager.MoveGameObjectToScene(copy, scene);
            }

            EditorSceneManager.CloseScene(demo, true);
            RestoreLighting(lighting);
            StripBorrowedCameras();
            BindVolume();
            SoftenLakeFoam();

            Physics.SyncTransforms();
            var lake = FindLake();
            if (lake == null)
            {
                throw new FileNotFoundException("Cloned demo has no lake.");
            }

            Bounds water = lake.bounds;
            QuietMagenta();
            QuietMagentaMaterials();
            HideTreesInWater(water);

            var authored = new GameObject("AuthoredComposition").transform;
            var setHero = Child(authored, "SetHero");
            Camera camHero = BuildCamera("CamHero", 36f);
            FrameHero(camHero, water, setHero);
            RelocateAuthoredIfInWater(water);

            EditorSceneManager.SaveScene(scene, ScenePath);
            StripTerrainTreesInWater(water);
            AssetDatabase.SaveAssets();
        }

        public static void BillboardCreatures(Camera camera)
        {
            var cards = Object.FindObjectsByType<CreaturePresentationV2>(FindObjectsInactive.Exclude, FindObjectsSortMode.None);
            for (int i = 0; i < cards.Length; i++)
            {
                cards[i].BillboardNow();
            }

            var motors = Object.FindObjectsByType<CreatureMotor>(FindObjectsInactive.Include, FindObjectsSortMode.None);
            for (int i = 0; i < motors.Length; i++)
            {
                motors[i].enabled = false;
            }

            var spacing = Object.FindObjectsByType<CreatureSpacing>(FindObjectsInactive.Include, FindObjectsSortMode.None);
            for (int i = 0; i < spacing.Length; i++)
            {
                spacing[i].enabled = false;
            }

            var agents = Object.FindObjectsByType<NavMeshAgent>(FindObjectsInactive.Include, FindObjectsSortMode.None);
            for (int i = 0; i < agents.Length; i++)
            {
                agents[i].enabled = false;
            }
        }

        public static void HideForegroundBlockers(Camera camera)
        {
            RestoreHidden();
            var renderers = Object.FindObjectsByType<Renderer>(FindObjectsInactive.Exclude, FindObjectsSortMode.None);
            for (int i = 0; i < renderers.Length; i++)
            {
                Renderer renderer = renderers[i];
                if (renderer == null || IsAuthored(renderer.gameObject))
                {
                    continue;
                }

                float distance = Vector3.Distance(camera.transform.position, renderer.bounds.center);
                if (distance < 0.6f || distance > 18f)
                {
                    continue;
                }

                Vector3 center = camera.WorldToViewportPoint(renderer.bounds.center);
                if (center.z < 0.8f || center.z > 16f)
                {
                    continue;
                }

                if (center.x < 0.22f || center.x > 0.78f)
                {
                    continue;
                }

                bool blockingRock = IsRockObject(renderer.gameObject) && center.y < 0.42f &&
                    Mathf.Max(renderer.bounds.size.x, renderer.bounds.size.z) > 1.6f &&
                    Mathf.Abs(center.x - 0.5f) < 0.16f;
                bool centerTrunk = IsTreeObject(renderer.gameObject) &&
                    renderer.bounds.size.y > 6.5f &&
                    Mathf.Abs(center.x - 0.5f) < 0.1f;
                if (!blockingRock && !centerTrunk)
                {
                    continue;
                }

                renderer.gameObject.SetActive(false);
                Hidden.Add(renderer.gameObject);
                Debug.Log("ZOO_VISUAL_COMPOSITION_HIDE " + renderer.gameObject.name + " d=" + distance.ToString("0.0") + " vp=" + center);
            }
        }

        public static void RestoreHidden()
        {
            for (int i = 0; i < Hidden.Count; i++)
            {
                if (Hidden[i] != null)
                {
                    Hidden[i].SetActive(true);
                }
            }

            Hidden.Clear();
        }

        static void CopyPipeline()
        {
            CopyFresh(VisualHeroSpikeRunner.DemoVolumePath, VisualCompositionSpikeRunner.HeroVolumePath);
            CopyFresh("Assets/Idyllic Fantasy Nature/Demo/Materials/Lake.mat", VisualCompositionSpikeRunner.SoftLakePath);
            PatchSoftLakeFile();
            AssetDatabase.ImportAsset(VisualCompositionSpikeRunner.SoftLakePath);
            AssetDatabase.SaveAssets();
        }

        static void SoftenLakeFoam()
        {
            var soft = AssetDatabase.LoadAssetAtPath<Material>(VisualCompositionSpikeRunner.SoftLakePath);
            if (soft == null)
            {
                return;
            }

            var renderers = Object.FindObjectsByType<Renderer>(FindObjectsInactive.Include, FindObjectsSortMode.None);
            for (int i = 0; i < renderers.Length; i++)
            {
                var mats = renderers[i].sharedMaterials;
                bool changed = false;
                for (int m = 0; m < mats.Length; m++)
                {
                    if (mats[m] != null && mats[m].name.Contains("Lake"))
                    {
                        mats[m] = soft;
                        changed = true;
                    }
                }

                if (changed)
                {
                    renderers[i].sharedMaterials = mats;
                }
            }
        }

        static void BindVolume()
        {
            var volumeGo = GameObject.Find("PostProcessing");
            if (volumeGo == null)
            {
                volumeGo = new GameObject("HeroVolume");
                volumeGo.AddComponent<Volume>();
            }

            volumeGo.name = "HeroVolume";
            var volume = volumeGo.GetComponent<Volume>();
            if (volume == null)
            {
                volume = volumeGo.AddComponent<Volume>();
            }

            volume.isGlobal = true;
            volume.priority = 1f;
            volume.sharedProfile = AssetDatabase.LoadAssetAtPath<VolumeProfile>(VisualCompositionSpikeRunner.HeroVolumePath);
        }

        static void FrameHero(Camera camera, Bounds water, Transform set)
        {
            Vector3 waterC = water.center;
            float radius = MeasureShoreRadius(waterC, waterC.y);
            Vector3 eye = new Vector3(waterC.x, 19.93f, waterC.z - 25.7f);
            Vector3 focus = new Vector3(waterC.x, 16.58f, waterC.z);
            Aim(camera, eye, focus, waterC);
            Physics.SyncTransforms();
            Vector3 forward = Flat(focus - eye);
            Vector3 right = Vector3.Cross(Vector3.up, forward);

            var path = new Vector3[6];
            path[0] = FirstLandOnRay(camera, 0.28f, 0.14f, waterC.y);
            path[1] = FirstLandOnRay(camera, 0.3f, 0.175f, waterC.y);
            path[2] = FirstLandOnRay(camera, 0.32f, 0.21f, waterC.y);
            path[3] = FirstLandOnRay(camera, 0.335f, 0.24f, waterC.y);
            path[4] = FirstLandOnRay(camera, 0.35f, 0.265f, waterC.y);
            path[5] = FirstLandOnRay(camera, 0.36f, 0.29f, waterC.y);
            for (int i = 0; i < path.Length; i++)
            {
                if (path[i].sqrMagnitude < 0.01f)
                {
                    continue;
                }

                Place(i % 2 == 0 ? "Stones_02" : "Stones_01", set, path[i], 10f + i * 19f, 0.82f, true);
            }

            Vector3 abutL = FirstLandOnRay(camera, 0.3f, 0.28f, waterC.y);
            Vector3 abutR = FirstLandOnRay(camera, 0.44f, 0.28f, waterC.y);
            if (abutL.sqrMagnitude > 0.01f)
            {
                Place("Stone_Medium_01", set, abutL, 28f, 0.48f, true);
            }

            if (abutR.sqrMagnitude > 0.01f)
            {
                Place("Stone_Medium_03", set, abutR, 44f, 0.46f, true);
            }

            Vector3 bridge = waterC - forward * 7.2f - right * 0.35f;
            bridge.y = waterC.y + 0.05f;
            PlaceLog("Branch_03", set, bridge, right, 1.72f);
            PlaceLog("Branch_05", set, bridge + forward * 0.4f + Vector3.up * 0.02f, right, 1.05f);
            PlaceLog("Branch_04", set, bridge - forward * 0.35f + Vector3.up * 0.02f, right, 0.9f);

            Vector3 archL = FirstLandOnRay(camera, 0.2f, 0.22f, waterC.y);
            Vector3 archR = FirstLandOnRay(camera, 0.46f, 0.22f, waterC.y);
            if (archL.sqrMagnitude < 0.01f)
            {
                archL = Ground(waterC - forward * (radius + 0.9f) - right * 3.6f, waterC.y + 0.1f);
            }

            if (archR.sqrMagnitude < 0.01f || archR.z > waterC.z - 6f)
            {
                archR = Ground(waterC - forward * (radius + 0.8f) + right * 2.1f, waterC.y + 0.1f);
            }

            Place("WillowTree_05_Green", set, archL, 54f, 0.34f, true);
            Place("WillowTree_04_Green", set, archR, 312f, 0.32f, true);

            if (path[3].sqrMagnitude > 0.01f)
            {
                Place("FlowerMeadow_White", set, path[3], 12f, 0.3f, true);
            }

            if (path[0].sqrMagnitude > 0.01f)
            {
                Place("Flower_White", set, path[0] - right * 0.4f, 16f, 0.48f, true);
            }

            Vector3 landmark = FarLandOnRay(camera, 0.4f, 0.52f, waterC.y);
            Vector3 fir = FarLandOnRay(camera, 0.5f, 0.54f, waterC.y);
            Vector3 farWillow = FarLandOnRay(camera, 0.58f, 0.5f, waterC.y);
            if (landmark.sqrMagnitude > 0.01f)
            {
                Place("BroadleafTree_05_Green", set, landmark, 16f, 0.95f, true);
            }

            if (fir.sqrMagnitude > 0.01f)
            {
                Place("Fir_04", set, fir, 8f, 0.9f, true);
            }

            if (farWillow.sqrMagnitude > 0.01f)
            {
                Place("WillowTree_03_Green", set, farWillow, 26f, 0.4f, true);
            }

            Place("LilyPads_02", set, new Vector3(waterC.x - 2.2f, waterC.y + 0.04f, waterC.z - 3.4f), 18f, 0.7f, false);
            Place("LilyPads_01", set, new Vector3(waterC.x + 3.1f, waterC.y + 0.04f, waterC.z + 1.8f), 40f, 0.58f, false);

            float facing = Mathf.Atan2(-forward.x, -forward.z) * Mathf.Rad2Deg;
            for (int i = 0; i < 20; i++)
            {
                float ang = facing - 82f + i * 8.6f;
                float dist = radius + (i % 2 == 0 ? 0.12f : 0.55f);
                Vector3 rim = Ground(waterC + Quaternion.Euler(0f, ang, 0f) * Vector3.forward * dist, waterC.y + 0.04f);
                Place(i % 2 == 0 ? "Grass_02" : "Grass_03", set, rim, ang, 0.54f + (i % 3) * 0.04f, true);
            }

            LogViewport(camera, "pathStart", path[0]);
            LogViewport(camera, "bridge", bridge);
            LogViewport(camera, "archL", archL);
            LogViewport(camera, "archR", archR);
            LogViewport(camera, "landmark", landmark);
            Debug.Log(
                "ZOO_VISUAL_COMPOSITION_LAYOUT v8 radius=" + radius.ToString("0.0") +
                " bridge=" + bridge + " landmark=" + landmark);
        }

        static Vector3 FirstLandOnRay(Camera camera, float vx, float vy, float waterY)
        {
            var land = FindLand();
            Ray ray = camera.ViewportPointToRay(new Vector3(vx, vy, 0f));
            for (float t = 5.5f; t <= 36f; t += 0.22f)
            {
                Vector3 point = ray.GetPoint(t);
                float groundY = land != null
                    ? land.SampleHeight(point) + land.transform.position.y
                    : waterY;
                if (groundY < waterY + 0.16f)
                {
                    continue;
                }

                if (point.y <= groundY + 0.28f)
                {
                    point.y = groundY;
                    return point;
                }
            }

            return Vector3.zero;
        }

        static Vector3 FarLandOnRay(Camera camera, float vx, float vy, float waterY)
        {
            var land = FindLand();
            Ray ray = camera.ViewportPointToRay(new Vector3(vx, vy, 0f));
            bool crossedWater = false;
            for (float t = 10f; t <= 88f; t += 0.28f)
            {
                Vector3 point = ray.GetPoint(t);
                float groundY = land != null
                    ? land.SampleHeight(point) + land.transform.position.y
                    : waterY;
                if (groundY < waterY + 0.14f)
                {
                    crossedWater = true;
                    continue;
                }

                if (!crossedWater || point.y > groundY + 0.45f)
                {
                    continue;
                }

                point.y = groundY;
                return point;
            }

            return Vector3.zero;
        }

        static Vector3 WaterOnRay(Camera camera, float vx, float vy, float waterY)
        {
            Ray ray = camera.ViewportPointToRay(new Vector3(vx, vy, 0f));
            if (Mathf.Abs(ray.direction.y) < 0.001f)
            {
                return ray.GetPoint(14f);
            }

            float t = (waterY - ray.origin.y) / ray.direction.y;
            if (t < 4f || t > 80f)
            {
                t = 14f;
            }

            Vector3 point = ray.GetPoint(t);
            point.y = waterY;
            return point;
        }

        static float MeasureShoreRadius(Vector3 waterC, float waterY)
        {
            var land = FindLand();
            var samples = new List<float>();
            for (int a = 0; a < 24; a++)
            {
                Vector3 dir = Quaternion.Euler(0f, a * 15f, 0f) * Vector3.forward;
                for (float d = 6f; d <= 20f; d += 0.35f)
                {
                    Vector3 p = waterC + dir * d;
                    float y = land != null
                        ? land.SampleHeight(p) + land.transform.position.y
                        : waterY;
                    if (y > waterY + 0.14f)
                    {
                        samples.Add(d);
                        break;
                    }
                }
            }

            if (samples.Count < 6)
            {
                return 13.2f;
            }

            samples.Sort();
            return Mathf.Clamp(samples[samples.Count / 2], 10.8f, 15.4f);
        }

        static void LogViewport(Camera camera, string label, Vector3 world)
        {
            Vector3 vp = camera.WorldToViewportPoint(world);
            Debug.Log("ZOO_VISUAL_COMPOSITION_VP " + label + " " + world + " vp=" + vp);
        }

        static void QuietMagenta()
        {
            var transforms = Object.FindObjectsByType<Transform>(FindObjectsInactive.Exclude, FindObjectsSortMode.None);
            for (int i = 0; i < transforms.Length; i++)
            {
                if (transforms[i] == null || IsAuthored(transforms[i].gameObject))
                {
                    continue;
                }

                if (IsMagentaFoliage(transforms[i].name))
                {
                    transforms[i].gameObject.SetActive(false);
                    Debug.Log("ZOO_VISUAL_COMPOSITION_QUIET " + transforms[i].name);
                }
            }
        }

        static void QuietMagentaMaterials()
        {
            var hidden = new HashSet<GameObject>();
            var renderers = Object.FindObjectsByType<Renderer>(FindObjectsInactive.Exclude, FindObjectsSortMode.None);
            for (int i = 0; i < renderers.Length; i++)
            {
                Renderer renderer = renderers[i];
                if (renderer == null || IsAuthored(renderer.gameObject) || !MaterialLooksMagenta(renderer))
                {
                    continue;
                }

                Transform root = FoliageRoot(renderer.transform);
                if (root == null || !hidden.Add(root.gameObject))
                {
                    continue;
                }

                root.gameObject.SetActive(false);
                Debug.Log("ZOO_VISUAL_COMPOSITION_QUIET_MAT " + root.name + " mat=" + renderer.sharedMaterial);
            }
        }

        static bool MaterialLooksMagenta(Renderer renderer)
        {
            var mats = renderer.sharedMaterials;
            for (int i = 0; i < mats.Length; i++)
            {
                if (mats[i] == null)
                {
                    continue;
                }

                string name = mats[i].name;
                if (name.Contains("Willow_Branch_Red") ||
                    name.Contains("Willow_Branch_Pink") ||
                    name.Contains("Willow_Branch_Purple") ||
                    name.Contains("Broadleaf_Red") ||
                    name.Contains("Broadleaf_Purple") ||
                    name.Contains("Broadleaf_Blue") ||
                    name.Contains("Tree_Leaf_Pink") ||
                    name.Contains("Tree_Leaf_Red") ||
                    name.Contains("Tree_Leaf_Purple") ||
                    name.Contains("Blossom"))
                {
                    return true;
                }
            }

            return false;
        }

        static void HideTreesInWater(Bounds water)
        {
            float waterY = water.center.y;
            var hidden = new HashSet<GameObject>();
            var nearest = new List<(float dist, string name, float feetY)>();
            var transforms = Object.FindObjectsByType<Transform>(FindObjectsInactive.Exclude, FindObjectsSortMode.None);
            for (int i = 0; i < transforms.Length; i++)
            {
                Transform transform = transforms[i];
                if (transform == null || IsAuthored(transform.gameObject) || !IsTreeName(transform.name))
                {
                    continue;
                }

                if (transform.parent != null && IsTreeName(transform.parent.name))
                {
                    continue;
                }

                Vector3 planar = transform.position - water.center;
                planar.y = 0f;
                float feetY = SampleGroundY(transform.position);
                nearest.Add((planar.magnitude, transform.name, feetY));
                bool interior = planar.magnitude < 12.4f;
                bool wet = feetY < waterY + 0.16f && planar.magnitude < 22f;
                if (!interior && !wet)
                {
                    continue;
                }

                if (!hidden.Add(transform.gameObject))
                {
                    continue;
                }

                transform.gameObject.SetActive(false);
                Debug.Log(
                    "ZOO_VISUAL_COMPOSITION_WATER_TREE " + transform.name +
                    " d=" + planar.magnitude.ToString("0.0") +
                    " feet=" + feetY.ToString("0.00") +
                    " water=" + waterY.ToString("0.00"));
            }

            var renderers = Object.FindObjectsByType<Renderer>(FindObjectsInactive.Exclude, FindObjectsSortMode.None);
            for (int i = 0; i < renderers.Length; i++)
            {
                Renderer renderer = renderers[i];
                if (renderer == null || IsAuthored(renderer.gameObject))
                {
                    continue;
                }

                Transform root = FoliageRoot(renderer.transform);
                if (root == null || hidden.Contains(root.gameObject))
                {
                    continue;
                }

                Vector3 planar = renderer.bounds.center - water.center;
                planar.y = 0f;
                if (planar.magnitude > 13.2f)
                {
                    continue;
                }

                root.gameObject.SetActive(false);
                hidden.Add(root.gameObject);
                Debug.Log(
                    "ZOO_VISUAL_COMPOSITION_WATER_BOUNDS " + root.name +
                    " d=" + planar.magnitude.ToString("0.0"));
            }

            nearest.Sort((a, b) => a.dist.CompareTo(b.dist));
            int show = Mathf.Min(10, nearest.Count);
            for (int i = 0; i < show; i++)
            {
                Debug.Log(
                    "ZOO_VISUAL_COMPOSITION_TREE_NEAR " + nearest[i].name +
                    " d=" + nearest[i].dist.ToString("0.0") +
                    " feet=" + nearest[i].feetY.ToString("0.00"));
            }
        }

        static float SampleGroundY(Vector3 position)
        {
            var land = FindLand();
            if (land == null)
            {
                return position.y;
            }

            return land.SampleHeight(position) + land.transform.position.y;
        }

        static bool FeetInWater(Vector3 position, float waterY)
        {
            return SampleGroundY(position) < waterY + 0.16f;
        }

        static void RelocateAuthoredIfInWater(Bounds water)
        {
            float keep = MeasureShoreRadius(water.center, water.center.y) + 1.8f;
            var props = Object.FindObjectsByType<IdyllicProp>(FindObjectsInactive.Exclude, FindObjectsSortMode.None);
            for (int i = 0; i < props.Length; i++)
            {
                IdyllicProp prop = props[i];
                if (prop == null || !IsTreeName(prop.gameObject.name))
                {
                    continue;
                }

                Vector3 planar = prop.transform.position - water.center;
                planar.y = 0f;
                if (planar.magnitude > 10.5f || !FeetInWater(prop.transform.position, water.center.y))
                {
                    continue;
                }
                Vector3 dir = planar.sqrMagnitude < 0.01f ? Vector3.back : planar.normalized;
                Vector3 next = Ground(water.center + dir * keep, water.center.y + 0.08f);
                prop.transform.position = next;
                Bounds world = IdyllicKit.CombinedBounds(prop.gameObject);
                if (world.size.sqrMagnitude > 0.0001f)
                {
                    prop.transform.position += Vector3.up * (next.y - world.min.y);
                }

                Debug.Log("ZOO_VISUAL_COMPOSITION_PUSH " + prop.gameObject.name + " -> " + prop.transform.position);
            }
        }

        static void StripTerrainTreesInWater(Bounds water)
        {
            float waterY = water.center.y;
            var terrains = Terrain.activeTerrains;
            for (int t = 0; t < terrains.Length; t++)
            {
                Terrain terrain = terrains[t];
                if (terrain == null || terrain.terrainData == null)
                {
                    continue;
                }

                var copy = Object.Instantiate(terrain.terrainData);
                copy.name = terrain.terrainData.name + "_HeroStrip";
                terrain.terrainData = copy;
                var trees = new List<TreeInstance>(copy.treeInstances);
                int before = trees.Count;
                trees.RemoveAll(instance =>
                {
                    Vector3 world = Vector3.Scale(instance.position, copy.size) + terrain.transform.position;
                    Vector3 planar = world - water.center;
                    planar.y = 0f;
                    return planar.magnitude < 14.2f ||
                        (SampleGroundY(world) < waterY + 0.16f && planar.magnitude < 22f);
                });
                copy.treeInstances = trees.ToArray();
                Debug.Log(
                    "ZOO_VISUAL_COMPOSITION_STRIP_TERRAIN " + terrain.name +
                    " " + before + "->" + trees.Count);
            }
        }

        static void FrameArrival(Camera camera, Bounds water, Transform set)
        {
            Vector3 waterC = water.center;
            Vector3 eye = SnapEyeLand(new Vector3(waterC.x - 10.8f, waterC.y + 2.4f, waterC.z - 27.4f), 2.08f, water);
            Vector3 focus = new Vector3(waterC.x - 2.2f, waterC.y + 0.72f, waterC.z - 9.4f);
            Aim(camera, eye, focus, waterC);
            Vector3 forward = Flat(focus - eye);
            Vector3 right = Vector3.Cross(Vector3.up, forward);

            for (int i = 0; i < 6; i++)
            {
                float t = 2.15f + i * 1.55f;
                float side = i % 2 == 0 ? -0.88f : 0.92f;
                Vector3 p = Ground(eye + forward * t + right * side, waterC.y + 0.1f);
                Place(i % 2 == 0 ? "Stones_02" : "Stones_01", set, p, 18f + i * 21f, 0.3f, true);
            }

            Vector3 bridge = Ground(eye + forward * 6.05f, waterC.y + 0.02f);
            Place("Branch_03", set, bridge + Vector3.up * 0.07f, Yaw(forward) + 88f, 1.12f, true);
            Place("Branch_04", set, Ground(eye + forward * 6.35f + right * 0.18f, waterC.y) + Vector3.up * 0.03f, Yaw(forward) + 94f, 0.64f, true);
            Place("Stone_Medium_01", set, Ground(bridge - right * 1.58f, waterC.y), 22f, 0.27f, true);
            Place("Stone_Medium_03", set, Ground(bridge + right * 1.62f, waterC.y), 44f, 0.25f, true);

            Vector3 gate = Ground(eye + forward * 13.1f, waterC.y + 0.08f);
            Place("BlossomTree_02", set, Ground(gate - right * 2.12f, waterC.y), 14f, 0.36f, true);
            Place("BlossomTree_04", set, Ground(gate + right * 2.22f, waterC.y), 328f, 0.34f, true);
            Place("BlossomTree_01", set, Ground(gate + forward * 1.7f, waterC.y), 46f, 0.22f, true);
            Place("FlowerMeadow_Pink", set, Ground(gate - right * 0.95f, waterC.y), 8f, 0.46f, true);
            Place("FlowerMeadow_Orange", set, Ground(gate + right * 1.05f, waterC.y), 24f, 0.42f, true);
            Place("Flower_Pink", set, Ground(gate - right * 0.35f, waterC.y), 16f, 0.68f, true);
            Place("WillowTree_01_Green", set, Ground(eye + forward * 17.6f - right * 3.5f, waterC.y), 16f, 0.32f, true);
            Place("Fir_03", set, Ground(eye + forward * 21.4f + right * 0.25f, waterC.y), 6f, 0.64f, true);

            Place("Plant_08", set, Ground(eye + forward * 1.8f - right * 1.38f, waterC.y), 24f, 0.56f, true);
            Place("Plant_01", set, Ground(eye + forward * 1.7f + right * 1.42f, waterC.y), 12f, 0.5f, true);
            Place("Grass_01", set, Ground(eye + forward * 2.0f - right * 0.48f, waterC.y), 10f, 0.76f, true);
            Place("Flower_YellowRed", set, Ground(eye + forward * 2.65f - right * 0.78f, waterC.y), 20f, 0.54f, true);
        }

        static void FramePond(Camera camera, Bounds water, Transform set)
        {
            Vector3 waterC = water.center;
            Vector3 eye = SnapEyeLand(new Vector3(waterC.x - 2.8f, waterC.y + 1.4f, waterC.z - 23.8f), 1.3f, water);
            Vector3 focus = new Vector3(waterC.x - 0.2f, waterC.y + 0.5f, waterC.z - 4.2f);
            Aim(camera, eye, focus, waterC);
            Vector3 forward = Flat(focus - eye);
            Vector3 right = Vector3.Cross(Vector3.up, forward);

            Place("Plant_08", set, Ground(eye + forward * 2.1f - right * 1.48f, waterC.y), 30f, 0.64f, true);
            Place("Plant_07", set, Ground(eye + forward * 1.65f - right * 1.68f, waterC.y), 42f, 0.46f, true);
            Place("Bush_01_01", set, Ground(eye + forward * 2.45f - right * 1.95f, waterC.y), 18f, 0.38f, true);
            Place("FlowerMeadow_Pink", set, Ground(eye + forward * 2.0f - right * 0.72f, waterC.y), 12f, 0.3f, true);
            Place("Grass_02", set, Ground(eye + forward * 1.8f + right * 1.22f, waterC.y), 16f, 0.7f, true);
            Place("Flower_Orange", set, Ground(eye + forward * 2.3f + right * 1.02f, waterC.y), 22f, 0.5f, true);
            Place("Plant_04", set, Ground(eye + forward * 1.6f + right * 1.48f, waterC.y), 8f, 0.44f, true);

            Vector3 bridge = Ground(eye + forward * 9.6f + right * 3.35f, waterC.y);
            Place("Branch_04", set, bridge + Vector3.up * 0.04f, Yaw(forward) + 68f, 0.84f, true);
            Place("Branch_02", set, Ground(bridge + forward * 0.55f - right * 0.22f, waterC.y) + Vector3.up * 0.02f, Yaw(forward) + 74f, 0.5f, true);
            Place("Rock_Small_01", set, Ground(bridge - forward * 0.7f, waterC.y), 28f, 0.22f, true);
            Place("Cattail_01", set, Ground(eye + forward * 11.0f + right * 3.95f, waterC.y), 18f, 0.48f, true);
            Place("Cattail_02", set, Ground(eye + forward * 10.4f + right * 3.15f, waterC.y), 40f, 0.4f, true);
            Place("LilyPads_02", set, new Vector3(waterC.x - 2.4f, waterC.y + 0.04f, waterC.z - 7.5f), 22f, 0.62f, false);
            Place("Waterlily_01", set, new Vector3(waterC.x - 1.05f, waterC.y + 0.05f, waterC.z - 6.1f), 12f, 0.78f, false);
            Place("BlossomTree_05", set, Ground(new Vector3(waterC.x + 3.1f, waterC.y, waterC.z + 8.4f), waterC.y), 14f, 0.32f, true);
            Place("Fir_02", set, Ground(new Vector3(waterC.x + 6.4f, waterC.y, waterC.z + 10.1f), waterC.y), 8f, 0.46f, true);
            Place("FloatingLeafs_Yellow", set, eye + forward * 5.1f + Vector3.up * 1.15f, 12f, 0.68f, false);
        }

        static void FrameMeadow(Camera camera, Bounds water, Transform set)
        {
            Vector3 waterC = water.center;
            Vector3 eye = SnapEyeLand(new Vector3(waterC.x + 24.8f, waterC.y + 2.2f, waterC.z - 21.2f), 1.7f, water);
            Vector3 focus = new Vector3(waterC.x + 21.4f, waterC.y + 0.68f, waterC.z - 3.8f);
            Aim(camera, eye, focus, waterC);
            Vector3 forward = Flat(focus - eye);
            Vector3 right = Vector3.Cross(Vector3.up, forward);

            Place("FlowerMeadow_White", set, Ground(eye + forward * 3.35f, waterC.y), 12f, 0.5f, true);
            Place("FlowerMeadow_Pink", set, Ground(eye + forward * 4.5f - right * 1.7f, waterC.y), 8f, 0.42f, true);
            Place("FlowerMeadow_Orange", set, Ground(eye + forward * 4.2f + right * 1.8f, waterC.y), 24f, 0.4f, true);
            Place("FlowerMeadow_Purple", set, Ground(eye + forward * 6.2f - right * 0.85f, waterC.y), 16f, 0.36f, true);
            Place("FlowerMeadow_Blue", set, Ground(eye + forward * 5.4f + right * 0.55f, waterC.y), 32f, 0.32f, true);
            Place("Grass_01", set, Ground(eye + forward * 2.15f - right * 1.0f, waterC.y), 10f, 0.86f, true);
            Place("Grass_03", set, Ground(eye + forward * 2.25f + right * 1.05f, waterC.y), 6f, 0.82f, true);
            Place("Plant_08", set, Ground(eye + forward * 1.5f - right * 1.52f, waterC.y), 34f, 0.58f, true);
            Place("Plant_01", set, Ground(eye + forward * 1.45f + right * 1.55f, waterC.y), 12f, 0.54f, true);
            Place("Flower_Yellow", set, Ground(eye + forward * 3.2f + right * 0.38f, waterC.y), 18f, 0.56f, true);
            Place("Flower_Pink", set, Ground(eye + forward * 3.0f - right * 0.5f, waterC.y), 26f, 0.54f, true);
            Place("WillowTree_02_Pink", set, Ground(eye + forward * 8.6f - right * 4.4f, waterC.y), 38f, 0.28f, true);
            Place("WillowTree_01_Green", set, Ground(eye + forward * 10.2f + right * 3.9f, waterC.y), 14f, 0.3f, true);
            Place("BlossomTree_03", set, Ground(eye + forward * 12.8f - right * 0.6f, waterC.y), 22f, 0.24f, true);
            Place("Bush_02_02", set, Ground(eye + forward * 6.4f + right * 2.7f, waterC.y), 28f, 0.42f, true);
            Place("Bush_03_01", set, Ground(eye + forward * 6.8f - right * 3.0f, waterC.y), 44f, 0.38f, true);
            Place("Rock_Small_03", set, Ground(eye + forward * 4.6f + right * 0.5f, waterC.y), 50f, 0.18f, true);
            Place("Fir_01", set, Ground(eye + forward * 16.2f + right * 1.1f, waterC.y), 8f, 0.4f, true);
            Place("FloatingLeafs_Green", set, eye + forward * 3.6f + Vector3.up * 1.05f, 8f, 0.62f, false);
        }

        static void SpawnPair(
            Transform set,
            Camera camera,
            Bounds water,
            string firstName,
            string secondName,
            bool secondFloats,
            float firstAlong,
            float firstSide,
            float secondAlong,
            float secondSide)
        {
            var assets = AssetDatabase.LoadAssetAtPath<ArtDirectionAssets>("Assets/VirtualZoo/Art/Creatures/Fixtures/ArtDirectionAssets.asset");
            if (assets == null)
            {
                throw new FileNotFoundException("ArtDirectionAssets missing.");
            }

            var factory = new CreatureFactoryV2(camera, assets.CreatureSlab, assets.CreatureNub, assets.CardShader, water.center.y + 0.04f);
            var catalog = new FileFixtureCatalog(FileFixtureCatalog.BundledRoot);
            var fixtures = catalog.LoadValidFixtures();
            var wp = new GameObject("Waypoint");
            wp.transform.SetParent(set, false);
            var points = new[] { wp.transform };

            Vector3 first = LandInView(camera, water, firstAlong, firstSide);
            Vector3 second = secondFloats
                ? WaterInView(camera, water)
                : LandInView(camera, water, secondAlong, secondSide);

            PlaceCreature(factory, fixtures, set, points, firstName, first + Vector3.up * 0.02f);
            PlaceCreature(factory, fixtures, set, points, secondName, second);
            BillboardCreatures(camera);
            Debug.Log("ZOO_VISUAL_COMPOSITION_CARD " + camera.name + " " + firstName + " pos=" + first + " vp=" + camera.WorldToViewportPoint(first + Vector3.up * 0.45f));
            Debug.Log("ZOO_VISUAL_COMPOSITION_CARD " + camera.name + " " + secondName + " pos=" + second + " vp=" + camera.WorldToViewportPoint(second + Vector3.up * 0.45f));
            var cards = set.GetComponentsInChildren<CreaturePresentationV2>(true);
            for (int i = 0; i < cards.Length; i++)
            {
                cards[i].gameObject.SetActive(false);
            }
        }

        static Vector3 LandInView(Camera camera, Bounds water, float along, float side)
        {
            Vector3 alongDir = Flat(camera.transform.forward);
            Vector3 right = Vector3.Cross(Vector3.up, alongDir);
            Vector3 guess = camera.transform.position + alongDir * along + right * side;
            for (int i = 0; i < 6; i++)
            {
                Vector3 away = guess - water.center;
                away.y = 0f;
                float keep = Mathf.Max(water.extents.x, water.extents.z) * 0.72f;
                if (away.sqrMagnitude > 0.01f && away.magnitude < keep)
                {
                    guess = water.center + away.normalized * keep;
                }

                Vector3 ground = Ground(guess, water.center.y + 0.28f);
                if (ground.y >= water.center.y + 0.22f)
                {
                    return ground;
                }

                if (away.sqrMagnitude < 0.01f)
                {
                    away = -Flat(camera.transform.forward);
                }

                guess += away.normalized * 2.4f;
            }

            Vector3 fallback = Ground(guess, water.center.y + 0.28f);
            fallback.y = Mathf.Max(fallback.y, water.center.y + 0.28f);
            return fallback;
        }

        static Vector3 WaterInView(Camera camera, Bounds water)
        {
            float radius = Mathf.Min(water.extents.x, water.extents.z) * 0.82f;
            Vector3 alongDir = Flat(camera.transform.forward);
            Vector3 right = Vector3.Cross(Vector3.up, alongDir);
            for (float along = 7.2f; along <= 11.5f; along += 1.1f)
            {
                for (float side = -1.1f; side <= 1.5f; side += 0.7f)
                {
                    Vector3 point = camera.transform.position + alongDir * along + right * side;
                    point.y = water.center.y + 0.05f;
                    Vector3 planar = point - water.center;
                    planar.y = 0f;
                    Vector3 viewport = camera.WorldToViewportPoint(point);
                    if (planar.magnitude > radius)
                    {
                        continue;
                    }

                    if (viewport.z > 3.2f && viewport.x > 0.34f && viewport.x < 0.72f && viewport.y > 0.34f && viewport.y < 0.58f)
                    {
                        return point;
                    }
                }
            }

            Vector3 fallback = Vector3.Lerp(camera.transform.position, water.center, 0.38f);
            fallback.y = water.center.y + 0.05f;
            return fallback;
        }

        static void PatchSoftLakeFile()
        {
            string path = Path.Combine(UnityEngine.Application.dataPath, "VirtualZoo/Art/VisualCompositionSpike/LakeSoftFoam.mat");
            if (!File.Exists(path))
            {
                return;
            }

            string text = File.ReadAllText(path);
            text = ReplaceFloat(text, "_CoastOpacity", "0");
            text = ReplaceFloat(text, "_Coast_Opacity", "0");
            text = ReplaceFloat(text, "_FoamAmount", "0");
            text = ReplaceFloat(text, "_Foam_Amount", "0");
            text = ReplaceFloat(text, "_FoamCutOff", "32");
            text = ReplaceFloat(text, "_EdgeFade", "0.02");
            text = ReplaceFloat(text, "_FoamDistance", "0.01");
            text = ReplaceColor(text, "_FoamColor", "0.35", "0.52", "0.50", "0");
            text = ReplaceColor(text, "_Foam_Color", "0.35", "0.52", "0.50", "0");
            text = ReplaceColor(text, "_RimColor", "0.28", "0.48", "0.50", "0");
            text = ReplaceColor(text, "_RippleColor", "0.30", "0.50", "0.52", "0.08");
            File.WriteAllText(path, text);
        }

        static string ReplaceColor(string text, string key, string r, string g, string b, string a)
        {
            int index = text.IndexOf("- " + key + ":", System.StringComparison.Ordinal);
            if (index < 0)
            {
                return text;
            }

            int end = text.IndexOf('\n', index);
            if (end < 0)
            {
                return text;
            }

            return text.Substring(0, index) + "- " + key + ": {r: " + r + ", g: " + g + ", b: " + b + ", a: " + a + "}" + text.Substring(end);
        }

        static string ReplaceFloat(string text, string key, string value)
        {
            int index = text.IndexOf("- " + key + ":", System.StringComparison.Ordinal);
            if (index < 0)
            {
                return text;
            }

            int end = text.IndexOf('\n', index);
            if (end < 0)
            {
                return text;
            }

            return text.Substring(0, index) + "- " + key + ": " + value + text.Substring(end);
        }

        static void PlaceCreature(
            CreatureFactoryV2 factory,
            IReadOnlyList<LoadedFixture> fixtures,
            Transform parent,
            Transform[] points,
            string displayName,
            Vector3 position)
        {
            LoadedFixture fixture = null;
            for (int i = 0; i < fixtures.Count; i++)
            {
                if (fixtures[i].Manifest.DisplayName == displayName)
                {
                    fixture = fixtures[i];
                    break;
                }
            }

            if (fixture == null)
            {
                throw new InvalidDataException("Missing fixture " + displayName);
            }

            var go = factory.Create(fixture, parent, points, 31);
            if (go == null)
            {
                throw new InvalidDataException("Failed to spawn " + displayName);
            }

            go.transform.position = position;
            go.transform.localScale = Vector3.one * 0.92f;
            var motor = go.GetComponent<CreatureMotor>();
            if (motor != null)
            {
                motor.enabled = false;
            }

            var spacing = go.GetComponent<CreatureSpacing>();
            if (spacing != null)
            {
                spacing.enabled = false;
            }

            var agent = go.GetComponent<NavMeshAgent>();
            if (agent != null)
            {
                agent.enabled = false;
            }
        }

        static Camera BuildCamera(string name, float fov)
        {
            var camera = VisualHeroSpikeRunner.CreateCaptureCamera(name);
            camera.tag = "Untagged";
            camera.fieldOfView = fov;
            camera.nearClipPlane = 0.22f;
            camera.farClipPlane = 420f;
            camera.enabled = true;
            return camera;
        }

        static void Aim(Camera camera, Vector3 eye, Vector3 focus, Vector3 waterCenter)
        {
            camera.transform.SetPositionAndRotation(eye, Quaternion.LookRotation((focus - eye).normalized, Vector3.up));
            Debug.Log("ZOO_VISUAL_COMPOSITION_CAM " + camera.name + " eye=" + eye + " focus=" + focus + " fov=" + camera.fieldOfView);
            Debug.Log("ZOO_VISUAL_COMPOSITION_WATER " + camera.name + " vp=" + camera.WorldToViewportPoint(waterCenter));
        }

        static Vector3 SnapEye(Vector3 guess, float height)
        {
            var terrain = FindLand();
            if (terrain != null)
            {
                float y = terrain.SampleHeight(guess) + terrain.transform.position.y;
                return new Vector3(guess.x, y + height, guess.z);
            }

            Vector3 ground = Ground(guess, guess.y);
            return new Vector3(ground.x, ground.y + height, ground.z);
        }

        static Vector3 SnapEyeLand(Vector3 guess, float height, Bounds water)
        {
            Vector3 away = new Vector3(guess.x - water.center.x, 0f, guess.z - water.center.z);
            if (away.sqrMagnitude < 0.01f)
            {
                away = Vector3.back;
            }

            away.Normalize();
            for (int i = 0; i < 8; i++)
            {
                Vector3 eye = SnapEye(guess, height);
                if (eye.y >= water.center.y + 1.72f)
                {
                    return eye;
                }

                guess += away * 3.8f;
            }

            Vector3 fallback = SnapEye(guess, height);
            fallback.y = Mathf.Max(fallback.y, water.center.y + 1.85f);
            return fallback;
        }

        static Vector3 Ground(Vector3 position, float minY)
        {
            var terrain = FindLand();
            if (terrain != null)
            {
                float y = terrain.SampleHeight(position) + terrain.transform.position.y;
                position.y = Mathf.Max(y, minY);
                return position;
            }

            Vector3 hit;
            if (RaycastTop(position + Vector3.up * 40f, out hit))
            {
                hit.y = Mathf.Max(hit.y, minY);
                return hit;
            }

            position.y = minY;
            return position;
        }

        static bool RaycastTop(Vector3 from, out Vector3 point)
        {
            var hits = Physics.RaycastAll(from, Vector3.down, 220f, ~0, QueryTriggerInteraction.Ignore);
            float bestY = float.NegativeInfinity;
            point = Vector3.zero;
            bool any = false;
            for (int i = 0; i < hits.Length; i++)
            {
                if (hits[i].normal.y < 0.35f)
                {
                    continue;
                }

                if (hits[i].point.y > bestY)
                {
                    bestY = hits[i].point.y;
                    point = hits[i].point;
                    any = true;
                }
            }

            return any;
        }

        static Terrain FindLand()
        {
            var terrains = Terrain.activeTerrains;
            for (int i = 0; i < terrains.Length; i++)
            {
                if (terrains[i] != null && terrains[i].name.Contains("Land"))
                {
                    return terrains[i];
                }
            }

            return terrains.Length > 0 ? terrains[0] : null;
        }

        static Renderer FindLake()
        {
            var renderers = Object.FindObjectsByType<Renderer>(FindObjectsInactive.Exclude, FindObjectsSortMode.None);
            Renderer best = null;
            float size = 0f;
            for (int i = 0; i < renderers.Length; i++)
            {
                if (renderers[i] == null)
                {
                    continue;
                }

                bool match = renderers[i].name.Contains("Lake") ||
                    (renderers[i].sharedMaterial != null && renderers[i].sharedMaterial.name.Contains("Lake"));
                if (!match)
                {
                    continue;
                }

                float volume = renderers[i].bounds.size.sqrMagnitude;
                if (volume > size)
                {
                    size = volume;
                    best = renderers[i];
                }
            }

            return best;
        }

        static void StripBorrowedCameras()
        {
            var cameras = Object.FindObjectsByType<Camera>(FindObjectsInactive.Include, FindObjectsSortMode.None);
            for (int i = 0; i < cameras.Length; i++)
            {
                Object.DestroyImmediate(cameras[i]);
            }

            var listeners = Object.FindObjectsByType<AudioListener>(FindObjectsInactive.Include, FindObjectsSortMode.None);
            for (int i = 0; i < listeners.Length; i++)
            {
                Object.DestroyImmediate(listeners[i]);
            }
        }

        struct LightingCache
        {
            public Material Skybox;
            public AmbientMode AmbientMode;
            public float AmbientIntensity;
            public bool Fog;
            public FogMode FogMode;
            public Color FogColor;
            public float FogDensity;
            public float FogStart;
            public float FogEnd;
            public DefaultReflectionMode ReflectionMode;
            public float ReflectionIntensity;
            public Color SubtractiveShadow;
        }

        static LightingCache CaptureLighting()
        {
            return new LightingCache
            {
                Skybox = RenderSettings.skybox,
                AmbientMode = RenderSettings.ambientMode,
                AmbientIntensity = RenderSettings.ambientIntensity,
                Fog = RenderSettings.fog,
                FogMode = RenderSettings.fogMode,
                FogColor = RenderSettings.fogColor,
                FogDensity = RenderSettings.fogDensity,
                FogStart = RenderSettings.fogStartDistance,
                FogEnd = RenderSettings.fogEndDistance,
                ReflectionMode = RenderSettings.defaultReflectionMode,
                ReflectionIntensity = RenderSettings.reflectionIntensity,
                SubtractiveShadow = RenderSettings.subtractiveShadowColor
            };
        }

        static void RestoreLighting(LightingCache lighting)
        {
            RenderSettings.skybox = lighting.Skybox;
            RenderSettings.ambientMode = lighting.AmbientMode;
            RenderSettings.ambientIntensity = lighting.AmbientIntensity;
            RenderSettings.fog = lighting.Fog;
            RenderSettings.fogMode = lighting.FogMode;
            RenderSettings.fogColor = lighting.FogColor;
            RenderSettings.fogDensity = lighting.FogDensity;
            RenderSettings.fogStartDistance = lighting.FogStart;
            RenderSettings.fogEndDistance = lighting.FogEnd;
            RenderSettings.defaultReflectionMode = lighting.ReflectionMode;
            RenderSettings.reflectionIntensity = lighting.ReflectionIntensity;
            RenderSettings.subtractiveShadowColor = lighting.SubtractiveShadow;
        }

        static GameObject PlaceLog(string prefab, Transform parent, Vector3 position, Vector3 along, float scale)
        {
            var go = Place(prefab, parent, position, Yaw(along), scale, false);
            Bounds world = IdyllicKit.CombinedBounds(go);
            if (world.size.y > world.size.x && world.size.y > world.size.z)
            {
                go.transform.rotation = Quaternion.LookRotation(Flat(along), Vector3.up) * Quaternion.Euler(90f, 0f, 0f);
                world = IdyllicKit.CombinedBounds(go);
            }

            if (world.size.sqrMagnitude > 0.0001f)
            {
                go.transform.position += Vector3.up * (position.y - world.min.y);
            }

            Debug.Log("ZOO_VISUAL_COMPOSITION_LOG " + prefab + " size=" + IdyllicKit.CombinedBounds(go).size);

            return go;
        }

        static GameObject Place(string prefab, Transform parent, Vector3 position, float yaw, float scale, bool snapFeet)
        {
            return IdyllicKit.Place(prefab, parent, position, yaw, scale, snapFeet, false);
        }

        static Transform Child(Transform parent, string name)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            return go.transform;
        }

        static Vector3 Flat(Vector3 value)
        {
            value.y = 0f;
            return value.sqrMagnitude < 0.0001f ? Vector3.forward : value.normalized;
        }

        static float Yaw(Vector3 forward)
        {
            return Quaternion.LookRotation(forward, Vector3.up).eulerAngles.y;
        }

        static bool IsAuthored(GameObject go)
        {
            return go.GetComponentInParent<IdyllicProp>() != null;
        }

        static bool IsTreeName(string name)
        {
            return name.Contains("Willow") ||
                name.Contains("Broadleaf") ||
                name.Contains("Blossom") ||
                name.Contains("Fir_");
        }

        static bool IsTreeObject(GameObject go)
        {
            Transform transform = go.transform;
            while (transform != null)
            {
                if (IsTreeName(transform.name))
                {
                    return true;
                }

                transform = transform.parent;
            }

            return false;
        }

        static bool IsMagentaFoliage(string name)
        {
            if (name.Contains("BlossomTree") || name.Contains("Waterlily"))
            {
                return true;
            }

            if (name.Contains("FlowerMeadow_Pink") ||
                name.Contains("FlowerMeadow_Purple") ||
                name.Contains("FlowerMeadow_Red") ||
                name.Contains("Flower_Pink") ||
                name.Contains("Flower_Purple") ||
                name.Contains("Flower_Red"))
            {
                return true;
            }

            bool colored = name.Contains("Pink") || name.Contains("Purple") || name.Contains("_Red") || name.Contains("_Blue");
            bool tree = name.Contains("Willow") || name.Contains("Broadleaf") || name.Contains("Bush") || name.Contains("Fir");
            return colored && tree;
        }

        static Transform FoliageRoot(Transform transform)
        {
            Transform found = null;
            while (transform != null)
            {
                if (IsTreeName(transform.name) || transform.name.Contains("Bush_") || transform.name.Contains("Plant_"))
                {
                    found = transform;
                }

                transform = transform.parent;
            }

            return found;
        }

        static bool IsRock(string name)
        {
            return name.Contains("Rock_Big") ||
                name.Contains("Rock_Medium") ||
                name.Contains("Stone_Big") ||
                name.Contains("Cliff_");
        }

        static bool IsRockObject(GameObject go)
        {
            Transform transform = go.transform;
            while (transform != null)
            {
                if (IsRock(transform.name))
                {
                    return true;
                }

                transform = transform.parent;
            }

            return false;
        }

        static void CopyFresh(string source, string dest)
        {
            if (AssetDatabase.LoadAssetAtPath<Object>(dest) != null)
            {
                AssetDatabase.DeleteAsset(dest);
            }

            AssetDatabase.CopyAsset(source, dest);
        }
    }
}
