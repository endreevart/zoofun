using Unity.AI.Navigation;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.AI;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using VirtualZoo.Presentation;

namespace VirtualZoo.EditorTools
{
    public static class ZooSceneBuilder
    {
        public const string ScenePath = "Assets/VirtualZoo/Scenes/ZooGarden.unity";
        const string ArtFolder = "Assets/VirtualZoo/Art";
        const string VolumePath = "Assets/VirtualZoo/Art/GardenVolumeProfile.asset";
        const string SkyPath = "Assets/VirtualZoo/Art/GardenSkybox.mat";

        public static void Build()
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            EnsureArtFolder();
            KenneyKit.ResetWarmCache();
            ApplyAtmosphere();

            var world = new GameObject("ZooWorld");
            var art = new GameObject("Art");
            art.transform.SetParent(world.transform, false);

            var grassHidden = ZooMaterials.CreateLit(Hex("86C07A"));
            var water = ZooMaterials.CreateLit(new Color(0.46f, 0.78f, 0.88f, 0.72f), true);
            if (water.HasProperty("_Smoothness"))
            {
                water.SetFloat("_Smoothness", 0.82f);
            }

            var ground = CreateBox("Ground", art.transform, new Vector3(0f, -0.16f, 0f), new Vector3(36f, 0.24f, 36f), grassHidden);
            ground.isStatic = true;
            var groundRenderer = ground.GetComponent<MeshRenderer>();
            if (groundRenderer != null)
            {
                groundRenderer.enabled = false;
            }

            BuildMeadowAndPath(art.transform);
            BuildPond(art.transform, water);
            BuildBridge(art.transform);
            ScatterGarden(art.transform);
            BuildFence(art.transform);
            BuildHills(art.transform);

            BuildLighting(world.transform);
            BuildVolume(world.transform);
            var camera = BuildCamera();

            var waypointRoot = new GameObject("Waypoints");
            waypointRoot.transform.SetParent(world.transform, false);
            var groundPts = MakeWaypoints(waypointRoot.transform, "Ground", GroundSpots(), 0.02f);
            var flyPts = MakeWaypoints(waypointRoot.transform, "Fly", FlySpots(), 0f);
            var floatPts = MakeWaypoints(waypointRoot.transform, "Float", FloatSpots(), 0f);

            var creatures = new GameObject("Creatures");
            var directorGo = new GameObject("ZooDirector");
            var director = directorGo.AddComponent<ZooDirector>();
            director.Configure(
                creatures.transform,
                groundPts,
                flyPts,
                floatPts,
                camera,
                20260826,
                new Vector3(-10.5f, -0.2f, -10.5f),
                new Vector3(10.5f, 6.2f, 10.5f));
            var overlay = directorGo.AddComponent<DeveloperOverlay>();
            overlay.Bind(director);

            var surface = ground.AddComponent<NavMeshSurface>();
            surface.collectObjects = CollectObjects.All;
            surface.useGeometry = NavMeshCollectGeometry.PhysicsColliders;
            surface.BuildNavMesh();

            DirectoryEnsure("Assets/VirtualZoo/Scenes");
            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
            EditorSceneManager.OpenScene(ScenePath);
        }

        static void ApplyAtmosphere()
        {
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = Hex("F3E2C4");
            RenderSettings.ambientEquatorColor = Hex("E8D4B0");
            RenderSettings.ambientGroundColor = Hex("8FBE78");
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = Hex("E8D8B8");
            RenderSettings.fogStartDistance = 20f;
            RenderSettings.fogEndDistance = 52f;
            RenderSettings.fogColor = Hex("E4D6B8");
            RenderSettings.subtractiveShadowColor = Hex("C4B49A");
            RenderSettings.skybox = CreateSkybox();
        }

        static Material CreateSkybox()
        {
            var shader = Shader.Find("Skybox/Procedural");
            if (shader == null)
            {
                shader = Shader.Find("Skybox/Procedural");
            }

            var sky = new Material(shader != null ? shader : Shader.Find("Hidden/InternalErrorShader"));
            if (sky.HasProperty("_SunDisk"))
            {
                sky.SetInt("_SunDisk", 2);
            }

            if (sky.HasProperty("_SunSize"))
            {
                sky.SetFloat("_SunSize", 0.04f);
            }

            if (sky.HasProperty("_AtmosphereThickness"))
            {
                sky.SetFloat("_AtmosphereThickness", 0.78f);
            }

            if (sky.HasProperty("_SkyTint"))
            {
                sky.SetColor("_SkyTint", Hex("F4D9A8"));
            }

            if (sky.HasProperty("_GroundColor"))
            {
                sky.SetColor("_GroundColor", Hex("CDB58A"));
            }

            if (sky.HasProperty("_Exposure"))
            {
                sky.SetFloat("_Exposure", 1.12f);
            }

            AssetDatabase.DeleteAsset(SkyPath);
            AssetDatabase.CreateAsset(sky, SkyPath);
            return AssetDatabase.LoadAssetAtPath<Material>(SkyPath);
        }

        static void BuildLighting(Transform world)
        {
            var lighting = new GameObject("Lighting");
            lighting.transform.SetParent(world, false);
            var sun = new GameObject("Sun");
            sun.transform.SetParent(lighting.transform, false);
            sun.transform.rotation = Quaternion.Euler(48f, 148f, 0f);
            var light = sun.AddComponent<Light>();
            light.type = LightType.Directional;
            light.color = Hex("FFE0B0");
            light.intensity = 1.08f;
            light.shadows = LightShadows.Soft;
            light.shadowStrength = 0.42f;
            light.shadowBias = 0.04f;

            var fillGo = new GameObject("Fill");
            fillGo.transform.SetParent(lighting.transform, false);
            fillGo.transform.rotation = Quaternion.Euler(18f, -52f, 0f);
            var fill = fillGo.AddComponent<Light>();
            fill.type = LightType.Directional;
            fill.color = Hex("D7E8FF");
            fill.intensity = 0.28f;
            fill.shadows = LightShadows.None;

            var bounceGo = new GameObject("Bounce");
            bounceGo.transform.SetParent(lighting.transform, false);
            bounceGo.transform.rotation = Quaternion.Euler(205f, 18f, 0f);
            var bounce = bounceGo.AddComponent<Light>();
            bounce.type = LightType.Directional;
            bounce.color = Hex("F6D7A8");
            bounce.intensity = 0.14f;
            bounce.shadows = LightShadows.None;
        }

        static void BuildVolume(Transform world)
        {
            AssetDatabase.DeleteAsset(VolumePath);
            var profile = ScriptableObject.CreateInstance<VolumeProfile>();
            var bloom = profile.Add<Bloom>(true);
            bloom.intensity.Override(0.14f);
            bloom.threshold.Override(1.08f);
            bloom.scatter.Override(0.55f);
            var vignette = profile.Add<Vignette>(true);
            vignette.intensity.Override(0.18f);
            vignette.smoothness.Override(0.42f);
            vignette.rounded.Override(true);
            var color = profile.Add<ColorAdjustments>(true);
            color.postExposure.Override(0.08f);
            color.contrast.Override(6f);
            color.saturation.Override(8f);
            AssetDatabase.CreateAsset(profile, VolumePath);

            var volumeGo = new GameObject("GardenVolume");
            volumeGo.transform.SetParent(world, false);
            var volume = volumeGo.AddComponent<Volume>();
            volume.isGlobal = true;
            volume.priority = 1f;
            volume.sharedProfile = AssetDatabase.LoadAssetAtPath<VolumeProfile>(VolumePath);
        }

        static Camera BuildCamera()
        {
            var cameraRig = new GameObject("ZooCameraRig");
            var camGo = new GameObject("Main Camera");
            camGo.tag = "MainCamera";
            camGo.transform.SetParent(cameraRig.transform, false);
            var camera = camGo.AddComponent<Camera>();
            camera.clearFlags = CameraClearFlags.Skybox;
            camera.backgroundColor = Hex("E8D6B0");
            camera.fieldOfView = 32f;
            camera.nearClipPlane = 0.3f;
            camera.farClipPlane = 70f;
            camera.allowHDR = true;
            var additional = camGo.AddComponent<UniversalAdditionalCameraData>();
            additional.renderPostProcessing = true;
            var rig = cameraRig.AddComponent<ZooCameraRig>();
            rig.Configure(camera, ZooLayout.OverviewFocus, new Vector2(3.2f, 3.2f));
            camGo.AddComponent<AudioListener>();
            camGo.transform.SetPositionAndRotation(
                ZooLayout.OverviewCamera,
                Quaternion.LookRotation((ZooLayout.OverviewFocus - ZooLayout.OverviewCamera).normalized, Vector3.up));
            return camera;
        }

        static void BuildMeadowAndPath(Transform parent)
        {
            var meadowMat = SaveMat("MeadowSurface.mat", ZooMaterials.CreateLit(Hex("78B46A")));
            if (meadowMat.HasProperty("_Smoothness"))
            {
                meadowMat.SetFloat("_Smoothness", 0.12f);
                EditorUtility.SetDirty(meadowMat);
            }

            var pathMat = SaveMat("PathRibbon.mat", ZooMaterials.CreateLit(Hex("C9925C")));
            if (pathMat.HasProperty("_Smoothness"))
            {
                pathMat.SetFloat("_Smoothness", 0.18f);
                EditorUtility.SetDirty(pathMat);
            }

            Mesh meadow = SaveMesh("MeadowSurface.asset", GardenMeshFactory.CreateMeadow(ZooLayout.PondCenter, ZooLayout.PondExtents));
            CreateMeshObject(GardenMeshFactory.MeadowName, parent, meadow, meadowMat);

            Mesh ribbon = SaveMesh("PathRibbon.asset", GardenMeshFactory.CreatePathRibbon(1.18f, ZooLayout.PathHeight));
            CreateMeshObject(GardenMeshFactory.PathName, parent, ribbon, pathMat);

            KenneyKit.Place(
                "path_wood",
                parent,
                new Vector3(3.55f, 0f, 6.35f),
                18f,
                0.85f,
                false,
                true,
                0f,
                false);
        }

        static void BuildPond(Transform parent, Material water)
        {
            var pondRoot = new GameObject("Pond");
            pondRoot.transform.SetParent(parent, false);
            Vector3 c = ZooLayout.PondCenter;
            var bankMat = SaveMat("PondBank.mat", ZooMaterials.CreateLit(Hex("8A6A45")));
            var waterMat = SaveMat("PondWater.mat", water);
            Mesh waterMesh = SaveMesh("PondWater.asset", GardenMeshFactory.CreateWater(c, ZooLayout.PondExtents, ZooLayout.WaterHeight));
            var waterGo = CreateMeshObject(GardenMeshFactory.WaterName, pondRoot.transform, waterMesh, waterMat);
            var obstacle = waterGo.AddComponent<NavMeshObstacle>();
            obstacle.carving = true;
            obstacle.shape = NavMeshObstacleShape.Capsule;
            obstacle.center = Vector3.zero;
            obstacle.size = new Vector3(ZooLayout.PondExtents.x * 2f, 1f, ZooLayout.PondExtents.y * 2f);

            Mesh bank = SaveMesh(
                "PondBank.asset",
                GardenMeshFactory.CreateBank(
                    c,
                    ZooLayout.PondExtents * 0.98f,
                    ZooLayout.PondExtents + new Vector2(0.72f, 0.72f),
                    ZooLayout.WaterHeight - 0.008f,
                    0.026f));
            CreateMeshObject(GardenMeshFactory.BankName, pondRoot.transform, bank, bankMat);

            KenneyKit.Place("lily_large", pondRoot.transform, c + new Vector3(-0.55f, ZooLayout.WaterHeight + 0.01f, 0.55f), 12f, 1f, false, true, 0.08f, false);
            KenneyKit.Place("lily_small", pondRoot.transform, c + new Vector3(0.55f, ZooLayout.WaterHeight + 0.01f, -0.35f), 40f, 1f, false, true, 0.06f, false);
            KenneyKit.Place("lily_small", pondRoot.transform, c + new Vector3(0.15f, ZooLayout.WaterHeight + 0.01f, 0.72f), 80f, 1f, false, true, 0.05f, false);
            KenneyKit.Place("lily_large", pondRoot.transform, c + new Vector3(0.35f, ZooLayout.WaterHeight + 0.01f, 0.15f), 120f, 1f, false, true, 0.07f, false);

            Vector3[] reeds =
            {
                c + new Vector3(-0.15f, 0f, 1.78f),
                c + new Vector3(0.35f, 0f, 1.72f),
                c + new Vector3(0.85f, 0f, 1.58f),
                c + new Vector3(1.15f, 0f, 1.28f),
                c + new Vector3(-0.55f, 0f, 1.68f),
                c + new Vector3(0.55f, 0f, 1.82f)
            };
            for (int i = 0; i < reeds.Length; i++)
            {
                KenneyKit.Place(
                    i % 2 == 0 ? "plant_flatTall" : "plant_flatShort",
                    pondRoot.transform,
                    reeds[i],
                    18f * i,
                    1f,
                    false,
                    true,
                    i % 2 == 0 ? 0.85f : 0.55f,
                    false);
            }

            KenneyKit.Place("rock_smallA", pondRoot.transform, c + new Vector3(2.05f, 0f, 0.85f), 25f, 1f, false, true, 0.28f, false);
            KenneyKit.Place("stone_smallA", pondRoot.transform, c + new Vector3(2.15f, 0f, -0.65f), 70f, 1f, false, true, 0.22f, false);
        }

        static void BuildBridge(Transform parent)
        {
            Vector3 c = ZooLayout.PondCenter;
            Vector3 bridgePos = c + new Vector3(2.05f, 0f, 0.08f);
            var bridge = KenneyKit.Place("bridge_wood", parent, bridgePos, 90f, 1.12f, true, true, 0f, true);
            bridge.name = "Bridge";
            KenneyKit.Place("bridge_side_wood", parent, bridgePos + new Vector3(0f, 0f, -0.38f), 90f, 1.12f, false, true, 0f, false);
            KenneyKit.Place("bridge_side_wood", parent, bridgePos + new Vector3(0f, 0f, 0.38f), 90f, 1.12f, false, true, 0f, false);
        }

        static void ScatterGarden(Transform parent)
        {
            var plants = new GameObject("Plants");
            plants.transform.SetParent(parent, false);

            PlaceTree(plants.transform, "tree_oak", new Vector3(-7.6f, 0f, -3.4f), 8f, 3.6f);
            PlaceTree(plants.transform, "tree_oak", new Vector3(7.8f, 0f, 2.6f), 22f, 3.8f);
            PlaceTree(plants.transform, "tree_oak", new Vector3(-7.2f, 0f, 5.4f), 40f, 3.5f);
            PlaceTree(plants.transform, "tree_pineTallA_detailed", new Vector3(7.4f, 0f, -3.8f), 12f, 4.6f);
            PlaceTree(plants.transform, "tree_pineTallA_detailed", new Vector3(-7.8f, 0f, 1.2f), 30f, 4.4f);
            PlaceTree(plants.transform, "tree_pineTallA_detailed", new Vector3(7.0f, 0f, 5.8f), 4f, 4.5f);
            PlaceTree(plants.transform, "tree_cone", new Vector3(7.2f, 0f, 0.2f), 16f, 3.15f);
            PlaceTree(plants.transform, "tree_cone", new Vector3(-7.4f, 0f, -1.2f), 50f, 3.05f);
            PlaceTree(plants.transform, "tree_detailed", new Vector3(-6.2f, 0f, 6.8f), 18f, 3.4f);
            PlaceTree(plants.transform, "tree_detailed", new Vector3(6.0f, 0f, -6.4f), 70f, 3.3f);

            KenneyKit.Place("plant_bushDetailed", plants.transform, new Vector3(-6.8f, 0f, -4.6f), 10f, 1f, false, true, 0.85f, false);
            KenneyKit.Place("plant_bush", plants.transform, new Vector3(6.6f, 0f, -3.8f), 40f, 1f, false, true, 0.7f, false);
            KenneyKit.Place("plant_bushLarge", plants.transform, new Vector3(7.2f, 0f, 2.2f), 8f, 1f, false, true, 0.95f, false);
            KenneyKit.Place("plant_bushSmall", plants.transform, new Vector3(-7.4f, 0f, 2.4f), 70f, 1f, false, true, 0.55f, false);
            KenneyKit.Place("plant_bushTriangle", plants.transform, new Vector3(2.0f, 0f, 8.0f), 20f, 1f, false, true, 0.65f, false);
            KenneyKit.Place("plant_bushDetailed", plants.transform, new Vector3(-2.6f, 0f, 7.8f), 55f, 1f, false, true, 0.8f, false);

            string[] flowers = { "flower_purpleA", "flower_purpleB", "flower_redA", "flower_yellowA", "flower_yellowB" };
            Vector3[] flowerSpots =
            {
                new Vector3(-5.4f, 0f, -4.2f),
                new Vector3(-4.6f, 0f, 4.8f),
                new Vector3(5.6f, 0f, -5.0f),
                new Vector3(6.4f, 0f, 3.4f),
                new Vector3(-6.0f, 0f, 0.6f),
                new Vector3(5.2f, 0f, 6.2f),
                new Vector3(-3.2f, 0f, 6.4f),
                new Vector3(3.8f, 0f, 7.0f),
                new Vector3(-5.8f, 0f, 5.0f),
                new Vector3(4.6f, 0f, -6.0f),
                new Vector3(6.8f, 0f, -1.6f),
                new Vector3(-6.6f, 0f, -0.4f)
            };
            for (int i = 0; i < flowerSpots.Length; i++)
            {
                KenneyKit.Place(flowers[i % flowers.Length], plants.transform, flowerSpots[i], i * 25f, 1f, false, true, 0.38f, false);
            }

            KenneyKit.Place("rock_smallA", plants.transform, new Vector3(-6.6f, 0f, 3.2f), 12f, 1f, false, true, 0.32f, false);
            KenneyKit.Place("rock_smallB", plants.transform, new Vector3(1.5f, 0f, 6.1f), 40f, 1f, false, true, 0.26f, false);
            KenneyKit.Place("rock_largeA", plants.transform, new Vector3(6.4f, 0f, -5.2f), 8f, 1f, false, true, 0.42f, false);
            KenneyKit.Place("stone_smallFlatA", plants.transform, new Vector3(-5.4f, 0f, -4.8f), 22f, 1f, false, true, 0.12f, false);

            KenneyKit.Place("mushroom_red", plants.transform, new Vector3(6.2f, 0f, -5.6f), 0f, 1f, false, true, 0.42f, false);
            KenneyKit.Place("mushroom_tan", plants.transform, new Vector3(6.55f, 0f, -5.35f), 30f, 1f, false, true, 0.28f, false);
            KenneyKit.Place("mushroom_redGroup", plants.transform, new Vector3(-6.4f, 0f, -3.2f), 12f, 1f, false, true, 0.38f, false);

            KenneyKit.Place("grass_large", plants.transform, new Vector3(6.8f, 0f, 4.6f), 0f, 1f, false, true, 0.35f, false);
            KenneyKit.Place("grass_leafsLarge", plants.transform, new Vector3(-6.2f, 0f, 4.8f), 40f, 1f, false, true, 0.32f, false);
            KenneyKit.Place("grass", plants.transform, new Vector3(7.0f, 0f, 1.4f), 15f, 1f, false, true, 0.28f, false);
            KenneyKit.Place("grass_large", plants.transform, new Vector3(-7.0f, 0f, -4.8f), 25f, 1f, false, true, 0.3f, false);
            KenneyKit.Place("stump_round", plants.transform, new Vector3(6.8f, 0f, -6.2f), 10f, 1f, false, true, 0.38f, false);
            KenneyKit.Place("log", plants.transform, new Vector3(-5.8f, 0f, 5.4f), 55f, 1f, false, true, 0.28f, false);
        }

        static void PlaceTree(Transform parent, string model, Vector3 position, float yaw, float height)
        {
            KenneyKit.Place(model, parent, position, yaw, 1f, true, true, height, true);
        }

        static void BuildFence(Transform parent)
        {
            var fence = new GameObject("Fence");
            fence.transform.SetParent(parent, false);
            const int count = 28;
            const float radius = 11.4f;
            for (int i = 0; i < count; i++)
            {
                float t = i / (float)count * Mathf.PI * 2f;
                var p = new Vector3(Mathf.Cos(t) * radius, 0f, Mathf.Sin(t) * radius);
                if (i == 21)
                {
                    KenneyKit.Place("fence_gate", fence.transform, new Vector3(0.15f, 0f, -radius), 0f, 1f, false, true, 1.15f, false);
                    continue;
                }

                float yaw = t * Mathf.Rad2Deg + 90f;
                string model = i % 4 == 0 ? "fence_simpleLow" : "fence_simple";
                KenneyKit.Place(model, fence.transform, p, yaw, 1f, false, true, 1.05f, false);
            }
        }

        static void BuildHills(Transform parent)
        {
            var hills = new GameObject("Hills");
            hills.transform.SetParent(parent, false);
            KenneyKit.Place("cliff_large_rock", hills.transform, new Vector3(-1.8f, -0.6f, 18.5f), 8f, 1f, false, true, 3.6f, false);
            KenneyKit.Place("cliff_block_rock", hills.transform, new Vector3(6.2f, -0.45f, 17.8f), 22f, 1f, false, true, 2.8f, false);
            KenneyKit.Place("cliff_half_rock", hills.transform, new Vector3(-7.6f, -0.5f, 17.2f), -18f, 1f, false, true, 2.6f, false);
            KenneyKit.Place("cliff_corner_rock", hills.transform, new Vector3(11.4f, -0.35f, 14.6f), 40f, 1f, false, true, 2.2f, false);
            KenneyKit.Place("cliff_block_rock", hills.transform, new Vector3(-12.0f, -0.4f, 13.8f), -30f, 1f, false, true, 2.4f, false);
            KenneyKit.Place("cliff_top_rock", hills.transform, new Vector3(1.4f, 0.8f, 19.0f), 12f, 1f, false, true, 1.2f, false);
            KenneyKit.Place("cliff_large_rock", hills.transform, new Vector3(15.4f, -0.7f, 4.2f), 80f, 1f, false, true, 3.2f, false);
            KenneyKit.Place("cliff_large_rock", hills.transform, new Vector3(-15.8f, -0.7f, 3.0f), -70f, 1f, false, true, 3.1f, false);
        }

        static Vector3[] GroundSpots()
        {
            return new[]
            {
                new Vector3(1.5f, 0f, -1.5f),
                new Vector3(3.2f, 0f, 0.1f),
                new Vector3(3.8f, 0f, 2.0f),
                new Vector3(1.9f, 0f, 3.3f),
                new Vector3(-1.2f, 0f, -1.6f),
                new Vector3(-4.2f, 0f, -1.8f),
                new Vector3(-4.4f, 0f, 2.7f),
                new Vector3(4.0f, 0f, -1.9f),
                new Vector3(3.8f, 0f, 3.6f),
                new Vector3(-0.4f, 0f, 3.7f)
            };
        }

        static Vector3[] FlySpots()
        {
            return new[]
            {
                new Vector3(-0.8f, 2.05f, -0.4f),
                new Vector3(1.8f, 2.15f, 0.7f),
                new Vector3(3.1f, 2.0f, -0.9f),
                new Vector3(-3.4f, 2.1f, 2.4f),
                new Vector3(0.5f, 2.08f, 2.9f),
                new Vector3(-2.1f, 2.02f, -1.5f)
            };
        }

        static Vector3[] FloatSpots()
        {
            Vector3 c = ZooLayout.PondCenter;
            float y = ZooLayout.WaterHeight;
            return new[]
            {
                new Vector3(c.x - 1.05f, y, c.z + 0.25f),
                new Vector3(c.x - 0.85f, y, c.z - 0.45f),
                new Vector3(c.x - 0.35f, y, c.z + 0.55f),
                new Vector3(c.x - 0.55f, y, c.z - 0.75f),
                new Vector3(c.x - 1.15f, y, c.z + 0.75f),
                new Vector3(c.x - 0.15f, y, c.z - 0.15f)
            };
        }

        static Transform[] MakeWaypoints(Transform parent, string group, Vector3[] spots, float y)
        {
            var root = new GameObject(group);
            root.transform.SetParent(parent, false);
            var list = new Transform[spots.Length];
            for (int i = 0; i < spots.Length; i++)
            {
                var go = new GameObject(group + "_" + i);
                go.transform.SetParent(root.transform, false);
                Vector3 p = spots[i];
                if (y != 0f)
                {
                    p.y = y;
                }

                go.transform.position = p;
                list[i] = go.transform;
            }

            return list;
        }

        static Material SaveMat(string fileName, Material material)
        {
            string path = ArtFolder + "/" + fileName;
            AssetDatabase.DeleteAsset(path);
            AssetDatabase.CreateAsset(material, path);
            return AssetDatabase.LoadAssetAtPath<Material>(path);
        }

        static Mesh SaveMesh(string fileName, Mesh mesh)
        {
            string path = ArtFolder + "/" + fileName;
            AssetDatabase.DeleteAsset(path);
            AssetDatabase.CreateAsset(mesh, path);
            return AssetDatabase.LoadAssetAtPath<Mesh>(path);
        }

        static GameObject CreateMeshObject(string name, Transform parent, Mesh mesh, Material material)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            var filter = go.AddComponent<MeshFilter>();
            filter.sharedMesh = mesh;
            var renderer = go.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = material;
            renderer.shadowCastingMode = ShadowCastingMode.Off;
            renderer.receiveShadows = true;
            go.isStatic = false;
            return go;
        }

        static GameObject CreateBox(string name, Transform parent, Vector3 pos, Vector3 scale, Material material)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = name;
            go.transform.SetParent(parent, false);
            go.transform.position = pos;
            go.transform.localScale = scale;
            go.GetComponent<MeshRenderer>().sharedMaterial = material;
            go.isStatic = true;
            return go;
        }

        static Color Hex(string hex)
        {
            ColorUtility.TryParseHtmlString("#" + hex, out var color);
            return color;
        }

        static void EnsureArtFolder()
        {
            if (!AssetDatabase.IsValidFolder("Assets/VirtualZoo"))
            {
                AssetDatabase.CreateFolder("Assets", "VirtualZoo");
            }

            if (!AssetDatabase.IsValidFolder(ArtFolder))
            {
                AssetDatabase.CreateFolder("Assets/VirtualZoo", "Art");
            }
        }

        static void DirectoryEnsure(string assetPath)
        {
            EnsureArtFolder();
            if (!AssetDatabase.IsValidFolder(assetPath))
            {
                AssetDatabase.CreateFolder("Assets/VirtualZoo", "Scenes");
            }
        }
    }
}
