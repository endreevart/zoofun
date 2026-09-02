using System.Collections.Generic;
using System.IO;
using Unity.AI.Navigation;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.AI;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using VirtualZoo.Domain;
using VirtualZoo.Presentation;

namespace VirtualZoo.EditorTools
{
    public static class ZooIdyllicGardenBuilder
    {
        public const string ScenePath = IdyllicLayout.ScenePath;
        const string ArtFolder = "Assets/VirtualZoo/Art/IdyllicGarden";
        const string VolumePath = ArtFolder + "/IdyllicVolumeProfile.asset";
        const string SkyPath = ArtFolder + "/IdyllicSkybox.mat";
        const string Vendor = "Assets/Idyllic Fantasy Nature/";

        public static void Build()
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            EnsureFolders();
            var mats = CreateMaterials();
            _active = mats;
            ApplyAtmosphere(mats.Sky);

            var world = new GameObject("ZooWorld");
            var art = Child(world.transform, "Art");
            var environment = Child(art.transform, "Environment");
            var vegetation = Child(art.transform, "Vegetation");
            var architecture = Child(art.transform, "Architecture");
            var props = Child(art.transform, "Props");

            BuildTerrain(environment.transform, mats);
            BuildArchitecture(architecture.transform, mats);
            ScatterVegetation(vegetation.transform);
            ScatterProps(props.transform);
            BuildHedges(vegetation.transform);
            BuildHills(environment.transform);

            BuildLighting(world.transform);
            BuildVolume(world.transform);
            var camera = BuildCamera();
            var zones = BuildZones(world.transform);

            var creatures = new GameObject("Creatures");
            var directorGo = new GameObject("ZooDirector");
            var director = directorGo.AddComponent<ZooDirector>();
            director.Configure(
                creatures.transform,
                zones.Ground,
                zones.Hop,
                zones.Fly,
                zones.Float,
                zones.Spawn,
                camera,
                LoadCardAssets(),
                20260827,
                IdyllicLayout.BoundsMin,
                IdyllicLayout.BoundsMax);
            var overlay = directorGo.AddComponent<DeveloperOverlay>();
            overlay.Bind(director);

            var ground = GameObject.CreatePrimitive(PrimitiveType.Cube);
            ground.name = "Ground";
            ground.transform.SetParent(art.transform, false);
            ground.transform.position = new Vector3(0f, -0.16f, 1.5f);
            ground.transform.localScale = new Vector3(44f, 0.24f, 46f);
            ground.GetComponent<MeshRenderer>().enabled = false;
            ground.isStatic = true;

            var pondBlock = new GameObject("PondObstacle");
            pondBlock.transform.SetParent(environment.transform, false);
            pondBlock.transform.position = IdyllicLayout.PondCenter + Vector3.up * 0.25f;
            var obstacle = pondBlock.AddComponent<NavMeshObstacle>();
            obstacle.carving = true;
            obstacle.shape = NavMeshObstacleShape.Capsule;
            obstacle.center = Vector3.zero;
            obstacle.size = new Vector3(IdyllicLayout.PondExtents.x * 2.2f, 1.4f, IdyllicLayout.PondExtents.y * 2.35f);

            ReplaceBrokenShaders();

            var surface = ground.AddComponent<NavMeshSurface>();
            surface.collectObjects = CollectObjects.All;
            surface.useGeometry = NavMeshCollectGeometry.PhysicsColliders;
            surface.BuildNavMesh();

            DirectoryEnsure();
            EditorSceneManager.SaveScene(scene, ScenePath);
            EnsureBuildSettings();
            EditorSceneManager.OpenScene(ScenePath);
        }

        static Materials _active;

        sealed class Materials
        {
            public Material Meadow;
            public Material Path;
            public Material Verge;
            public Material Bank;
            public Material Water;
            public Material Basin;
            public Material Wood;
            public Material Stone;
            public Material GateArch;
            public Material GatePillar;
            public Material Sky;
            public Material BushA;
            public Material BushB;
            public Material BushC;
            public Material ForestCanopy;
            public Material ForestLeaf;
            public Material ForestWillow;
            public Material ForestFir;
            public Material GrassA;
            public Material GrassB;
            public Material GrassC;
            public Material Lily;
        }

        sealed class ZoneWaypoints
        {
            public Transform[] Ground;
            public Transform[] Hop;
            public Transform[] Fly;
            public Transform[] Float;
            public Transform[] Spawn;
        }

        static Materials CreateMaterials()
        {
            var grass = RecolorAlbedo(LoadTex("Textures/Ground/Grass/Grass_Albedo.png"), ArtFolder + "/MeadowAlbedo.png", 0.28f, 0.82f, 0.98f);
            var grassN = LoadTex("Textures/Ground/Grass/Grass_Normal.png");
            var dirt = RecolorAlbedo(LoadTex("Textures/Ground/Dirt/Dirt_01_Albedo.png"), ArtFolder + "/PathAlbedo.png", 0.08f, 0.52f, 0.96f);
            var dirtN = LoadTex("Textures/Ground/Dirt/Dirt_Normal.png");
            var bark = LoadTex("Textures/Trees/Bark_Albedo.png");
            var barkN = LoadTex("Textures/Trees/Bark_Normal.png");
            var rock = LoadTex("Textures/Ground/Rock/Rock_Albedo.png");
            var waterN = LoadTex("Textures/Water/Water_Normal_01.png");
            var water = CreateTurquoiseWater(waterN);

            string skySrc = Vendor + "Materials/Skybox/Skybox.mat";
            AssetDatabase.DeleteAsset(SkyPath);
            if (!AssetDatabase.CopyAsset(skySrc, SkyPath))
            {
                throw new System.InvalidOperationException("Could not copy Skybox material.");
            }

            return new Materials
            {
                Meadow = Save(ArtFolder + "/Meadow.mat", TexturedLit(grass, grassN, Hex("7CB862"), 0.12f, new Vector2(3.4f, 3.4f))),
                Path = Save(ArtFolder + "/Path.mat", TexturedLit(dirt, dirtN, Hex("D6C4A0"), 0.22f, new Vector2(1.5f, 1.5f))),
                Verge = Save(ArtFolder + "/PathVerge.mat", TexturedLit(dirt, grassN, Hex("6A9A4E"), 0.10f, new Vector2(2.0f, 2.0f))),
                Bank = Save(ArtFolder + "/PondBank.mat", TexturedLit(dirt, dirtN, Hex("C8B48A"), 0.16f, new Vector2(2.0f, 2.0f))),
                Water = water,
                Basin = Save(ArtFolder + "/PondDeep.mat", SolidLit(Hex("1A3A42"), 0.28f)),
                Wood = Save(ArtFolder + "/Wood.mat", TexturedLit(bark, barkN, Hex("C4965A"), 0.28f, new Vector2(2.2f, 2.4f))),
                Stone = Save(ArtFolder + "/Stone.mat", TexturedLit(rock, null, Hex("D4C09A"), 0.20f, new Vector2(2.2f, 2.2f))),
                GateArch = Save(ArtFolder + "/GateArch.mat", TexturedLit(rock, null, Hex("E6D6BE"), 0.22f, new Vector2(1.8f, 1.8f))),
                GatePillar = Save(ArtFolder + "/GatePillar.mat", TexturedLit(rock, null, Hex("C4A078"), 0.18f, new Vector2(1.6f, 1.6f))),
                Sky = AssetDatabase.LoadAssetAtPath<Material>(SkyPath),
                BushA = CopyTintedBush("Materials/Bushes/Bush_01.mat", "BushGreenA.mat"),
                BushB = CopyTintedBush("Materials/Bushes/Bush_02.mat", "BushGreenB.mat"),
                BushC = CopyTintedBush("Materials/Bushes/Bush_03.mat", "BushGreenC.mat"),
                ForestCanopy = CopyTintedFoliage("Materials/Trees/Broadleaf_Green.mat", "ForestCanopy.mat"),
                ForestLeaf = CopyTintedFoliage("Materials/FX/Tree_Leaf_Green.mat", "ForestLeaf.mat"),
                ForestWillow = CopyTintedFoliage("Materials/Trees/Willow_Branch_Green.mat", "ForestWillow.mat"),
                ForestFir = CopyTintedFoliage("Materials/Trees/Fir_Branch.mat", "ForestFir.mat"),
                GrassA = CopyTintedFoliage("Materials/Grass/Grass_01.mat", "GrassGreenA.mat"),
                GrassB = CopyTintedFoliage("Materials/Grass/Grass_02.mat", "GrassGreenB.mat"),
                GrassC = CopyTintedFoliage("Materials/Grass/Grass_03.mat", "GrassGreenC.mat"),
                Lily = CopyTintedFoliage("Materials/Waterplants/LilyPad.mat", "LilyGreen.mat")
            };
        }

        static Material CreateTurquoiseWater(Texture2D waterN)
        {
            var mat = ZooMaterials.CreateLit(new Color(0.18f, 0.50f, 0.54f, 1f), false);
            if (mat.HasProperty("_Smoothness"))
            {
                mat.SetFloat("_Smoothness", 0.90f);
            }

            if (mat.HasProperty("_Metallic"))
            {
                mat.SetFloat("_Metallic", 0.04f);
            }

            if (waterN != null && mat.HasProperty("_BumpMap"))
            {
                mat.SetTexture("_BumpMap", waterN);
                mat.SetTextureScale("_BumpMap", new Vector2(1.6f, 1.6f));
                mat.EnableKeyword("_NORMALMAP");
            }

            if (mat.HasProperty("_BaseColor"))
            {
                mat.SetColor("_BaseColor", new Color(0.18f, 0.50f, 0.54f, 1f));
            }

            return Save(ArtFolder + "/PondWater.mat", mat);
        }

        static Material CopyTintedBush(string relative, string destName)
        {
            string src = Vendor + relative;
            string dst = ArtFolder + "/" + destName;
            AssetDatabase.DeleteAsset(dst);
            if (!AssetDatabase.CopyAsset(src, dst))
            {
                throw new System.InvalidOperationException("Could not copy " + relative);
            }

            var mat = AssetDatabase.LoadAssetAtPath<Material>(dst);
            var leaf = Hex("4A8A42");
            var top = Hex("68A050");
            var bottom = Hex("2E522C");
            SetColor(mat, "_Color", leaf);
            SetColor(mat, "_BaseColor", leaf);
            SetColor(mat, "_Top_Color", new Color(top.r, top.g, top.b, 0f));
            SetColor(mat, "_Bottom_Color", new Color(bottom.r, bottom.g, bottom.b, 0f));
            if (mat.HasProperty("_Enable_Top_Color"))
            {
                mat.SetFloat("_Enable_Top_Color", 1f);
            }

            return mat;
        }

        static Material CopyTintedFoliage(string relative, string destName)
        {
            string src = Vendor + relative;
            string dst = ArtFolder + "/" + destName;
            AssetDatabase.DeleteAsset(dst);
            if (!AssetDatabase.CopyAsset(src, dst))
            {
                throw new System.InvalidOperationException("Could not copy " + relative);
            }

            var mat = AssetDatabase.LoadAssetAtPath<Material>(dst);
            var leaf = Hex("478844");
            var top = Hex("64A04C");
            var bottom = Hex("2C522C");
            SetColor(mat, "_Color", leaf);
            SetColor(mat, "_BaseColor", leaf);
            SetColor(mat, "_Top_Color", new Color(top.r, top.g, top.b, 0f));
            SetColor(mat, "_Bottom_Color", new Color(bottom.r, bottom.g, bottom.b, 0f));
            if (mat.HasProperty("_Enable_Top_Color"))
            {
                mat.SetFloat("_Enable_Top_Color", 1f);
            }

            if (mat.HasProperty("_Custom_Color"))
            {
                mat.SetFloat("_Custom_Color", 1f);
            }

            mat.SetShaderPassEnabled("SHADOWCASTER", true);
            return mat;
        }

        static void SetColor(Material material, string name, Color color)
        {
            if (material != null && material.HasProperty(name))
            {
                material.SetColor(name, color);
            }
        }

        static void BuildTerrain(Transform parent, Materials mats)
        {
            Vector3 pond = IdyllicLayout.PondCenter;
            Vector2 extents = IdyllicLayout.PondExtents;
            Mesh meadowMesh = SaveMesh("MeadowSurface.asset", GardenMeshFactory.CreateMeadow(pond, extents, IdyllicLayout.MeadowExtent));
            var meadow = CreateNamedMesh(GardenMeshFactory.MeadowName, parent, meadowMesh, mats.Meadow);
            meadow.isStatic = false;

            Mesh pathMesh = SaveMesh("PathRibbon.asset", GardenMeshFactory.CreateBlendedDirtPath(1.42f, 0.01f, IdyllicLayout.PathControlPoints()));
            var path = CreateNamedMesh(GardenMeshFactory.PathName, parent, pathMesh, mats.Path, mats.Meadow);
            path.isStatic = false;

            Mesh waterMesh = SaveMesh("PondWater.asset", GardenMeshFactory.CreateIrregularWater(pond, extents, IdyllicLayout.WaterHeight, 0.94f));
            var water = CreateNamedMesh(GardenMeshFactory.WaterName, parent, waterMesh, mats.Water);
            var waterRenderer = water.GetComponent<MeshRenderer>();
            waterRenderer.shadowCastingMode = ShadowCastingMode.Off;
            waterRenderer.receiveShadows = true;
            var motion = water.AddComponent<WaterMotion>();
            motion.Configure(0.010f, 0.46f);

            Mesh bankMesh = SaveMesh(
                "PondBank.asset",
                GardenMeshFactory.CreateIrregularBank(
                    pond,
                    extents,
                    0.96f,
                    0.22f,
                    IdyllicLayout.WaterHeight + 0.004f,
                    0.04f));
            var bank = CreateNamedMesh(GardenMeshFactory.BankName, parent, bankMesh, mats.Bank);
            bank.isStatic = false;
        }

        static void BuildArchitecture(Transform parent, Materials mats)
        {
            Vector3 pond = IdyllicLayout.PondCenter;
            var bridge = PremiumKit.Place(
                "bridge_round",
                parent,
                pond + new Vector3(0.08f, 0.08f, 0.22f),
                90f,
                1f,
                true,
                false,
                true,
                0.82f);
            bridge.name = "Bridge";
            PremiumKit.SetMaterials(bridge, mats.Wood);
            AlignOnXZ(bridge, pond + new Vector3(0.08f, 0.08f, 0.22f));
            var bridgeRenderer = bridge.GetComponentInChildren<MeshRenderer>();
            Bounds bridgeBounds = bridgeRenderer.bounds;
            UnityEngine.Debug.Log("ZOO_BRIDGE_BOUNDS " + bridgeBounds + " pos=" + bridge.transform.position);

            Mesh padMesh = SaveMesh("BridgePad.asset", GardenMeshFactory.CreateGroundPad(0.95f, 0.12f, 0.78f));
            var padL = CreateNamedMesh("BridgePadL", parent, padMesh, mats.Meadow);
            padL.transform.position = new Vector3(bridgeBounds.min.x, 0f, bridgeBounds.center.z);
            AlignOnXZ(padL, new Vector3(bridgeBounds.min.x, 0f, bridgeBounds.center.z));
            var padR = CreateNamedMesh("BridgePadR", parent, padMesh, mats.Meadow);
            padR.transform.position = new Vector3(bridgeBounds.max.x, 0f, bridgeBounds.center.z);
            AlignOnXZ(padR, new Vector3(bridgeBounds.max.x, 0f, bridgeBounds.center.z));
            AlignOnXZ(bridge, new Vector3(bridgeBounds.center.x, 0.10f, bridgeBounds.center.z));

            var nearFoot = IdyllicKit.Place(
                "Rock_Small_01",
                parent,
                new Vector3(bridgeBounds.min.x, 0f, bridgeBounds.center.z),
                22f,
                0.28f,
                true,
                false);
            nearFoot.name = "BridgeAbutmentNear";
            var farFoot = IdyllicKit.Place(
                "Rock_Small_02",
                parent,
                new Vector3(bridgeBounds.max.x, 0f, bridgeBounds.center.z),
                -18f,
                0.26f,
                true,
                false);
            farFoot.name = "BridgeAbutmentFar";
            Place("Grass_01", parent, pond + new Vector3(-1.35f, 0f, 1.42f), 8f, 0.82f, false);
            Place("Grass_03", parent, pond + new Vector3(1.28f, 0f, 1.35f), 50f, 0.8f, false);

            Vector3 gate = IdyllicLayout.GatePosition;
            Mesh gateMesh = SaveMesh("StoryGate.asset", GardenMeshFactory.CreateStoryGate());
            var arch = CreateNamedMesh(GardenMeshFactory.GateName, parent, gateMesh, mats.GateArch);
            arch.transform.position = gate;
            AlignOnXZ(arch, gate);
            var gateRenderer = arch.GetComponent<MeshRenderer>();
            arch.transform.position += Vector3.up * (gate.y - gateRenderer.bounds.min.y);
            var box = arch.AddComponent<BoxCollider>();
            Bounds gateBounds = gateRenderer.bounds;
            box.center = arch.transform.InverseTransformPoint(gateBounds.center);
            Vector3 lossy = arch.transform.lossyScale;
            box.size = new Vector3(
                gateBounds.size.x / Mathf.Max(0.0001f, lossy.x),
                gateBounds.size.y / Mathf.Max(0.0001f, lossy.y),
                gateBounds.size.z / Mathf.Max(0.0001f, lossy.z));
            UnityEngine.Debug.Log("ZOO_GATE_BOUNDS " + gateRenderer.bounds);

            Mesh plinthMesh = SaveMesh("GatePlinth.asset", GardenMeshFactory.CreateStonePlinth());
            var pillarL = CreateNamedMesh("GatePillarL", arch.transform, plinthMesh, mats.GatePillar);
            pillarL.transform.localPosition = new Vector3(-1.22f, 0f, 0f);
            pillarL.transform.localRotation = Quaternion.identity;
            var pillarR = CreateNamedMesh("GatePillarR", arch.transform, plinthMesh, mats.GatePillar);
            pillarR.transform.localPosition = new Vector3(1.22f, 0f, 0f);
            pillarR.transform.localRotation = Quaternion.identity;
            Place("Grass_01", parent, gate + new Vector3(-2.15f, 0f, -0.55f), 18f, 0.92f, false);
            Place("Grass_03", parent, gate + new Vector3(2.12f, 0f, -0.52f), 50f, 0.9f, false);
            var lanternL = PremiumKit.Place("lantern", parent, gate + new Vector3(-2.48f, 0f, 0.55f), 8f, 0.72f, true);
            lanternL.name = "GateLanternL";
            PremiumKit.SetMaterials(lanternL, mats.Wood, mats.Stone);
            var lanternR = PremiumKit.Place("lantern", parent, gate + new Vector3(2.52f, 0f, 0.52f), -10f, 0.7f, true);
            lanternR.name = "GateLanternR";
            PremiumKit.SetMaterials(lanternR, mats.Wood, mats.Stone);
            var tower = PremiumKit.Place("story_tower", parent, gate + new Vector3(4.55f, 0f, 2.15f), -18f, 0.74f, true, false, false, 3.35f);
            tower.name = "StoryTower";
            PremiumKit.SetMaterials(tower, mats.Stone, mats.Wood);
            var burrow = PremiumKit.Place("hill_burrow", parent, new Vector3(-6.15f, 0f, 4.85f), 32f, 0.5f, true);
            burrow.name = "HillBurrow";
        }

        static void AlignOnXZ(GameObject go, Vector3 target)
        {
            var renderer = go.GetComponentInChildren<MeshRenderer>();
            if (renderer == null)
            {
                return;
            }

            Bounds bounds = renderer.bounds;
            go.transform.position += new Vector3(target.x - bounds.center.x, 0f, target.z - bounds.center.z);
            bounds = renderer.bounds;
            go.transform.position += Vector3.up * (target.y - bounds.min.y);
        }

        static void ScatterVegetation(Transform vegetation)
        {
            PlaceForegroundFrame(vegetation);
            PlacePathBeds(vegetation);
            PlacePondPlants(vegetation);
            PlaceGroves(vegetation);
            PlaceGateGrove(vegetation);
        }

        static void PlaceForegroundFrame(Transform vegetation)
        {
            Place("Flower_Orange", vegetation, new Vector3(-2.35f, 0f, -1.55f), 12f, 0.92f, false);
            Place("Flower_Pink", vegetation, new Vector3(-1.55f, 0f, -1.48f), 28f, 0.86f, false);
            Place("Plant_03", vegetation, new Vector3(-2.95f, 0f, -1.62f), 8f, 0.95f, false);
            Place("Flower_Purple", vegetation, new Vector3(2.35f, 0f, -1.52f), 20f, 0.9f, false);
            Place("Flower_Pink", vegetation, new Vector3(2.85f, 0f, -1.38f), 55f, 0.82f, false);
            Place("Plant_06", vegetation, new Vector3(3.15f, 0f, -1.58f), 62f, 0.88f, false);
            Place("Bush_02_01", vegetation, new Vector3(-3.85f, 0f, -1.85f), 18f, 0.78f, false);
            Place("Bush_01_01", vegetation, new Vector3(3.92f, 0f, -1.88f), 44f, 0.76f, false);
        }

        static void PlacePathBeds(Transform vegetation)
        {
            Place("Flower_Orange", vegetation, new Vector3(2.05f, 0f, 0.22f), 22f, 0.82f, false);
            Place("FlowerMeadow_Orange", vegetation, new Vector3(2.35f, 0f, 0.95f), 14f, 0.48f, false);
            Place("Flower_White", vegetation, new Vector3(1.85f, 0f, 2.55f), 36f, 0.78f, false);
            Place("Flower_Pink", vegetation, new Vector3(-1.15f, 0f, 4.65f), 18f, 0.82f, false);
            Place("FlowerMeadow_Pink", vegetation, new Vector3(2.15f, 0f, 3.45f), 18f, 0.46f, false);
            Place("Bush_02_02", vegetation, new Vector3(3.35f, 0f, 1.95f), 24f, 0.86f, false);
            Place("FlowerMeadow_Pink", vegetation, new Vector3(3.55f, 0f, 2.65f), 16f, 0.48f, false);
            Place("Plant_08", vegetation, new Vector3(3.45f, 0f, 0.65f), 40f, 0.88f, false);
            Place("Grass_01", vegetation, new Vector3(1.05f, 0f, -0.55f), 18f, 0.82f, false);
            Place("Grass_03", vegetation, new Vector3(-0.72f, 0f, 0.85f), 42f, 0.78f, false);
            Place("Grass_01", vegetation, new Vector3(1.55f, 0f, 1.85f), 8f, 0.8f, false);
            Place("Grass_02", vegetation, new Vector3(-0.85f, 0f, 2.95f), 28f, 0.76f, false);
            Place("Grass_03", vegetation, new Vector3(1.35f, 0f, 3.85f), 50f, 0.8f, false);
            Place("Grass_01", vegetation, new Vector3(-0.65f, 0f, 4.55f), 16f, 0.78f, false);
        }

        static void PlacePondPlants(Transform vegetation)
        {
            Vector3 pond = IdyllicLayout.PondCenter;
            Place("WillowTree_02_Green", vegetation, pond + new Vector3(-2.15f, 0f, 1.62f), 18f, 0.26f, true);
            Place("WillowTree_01_Green", vegetation, pond + new Vector3(-2.42f, 0f, 0.48f), 52f, 0.22f, true);
            Place("Reeds_01", vegetation, pond + new Vector3(-1.72f, 0f, 1.48f), 26f, 0.78f, false);
            Place("Flower_White", vegetation, pond + new Vector3(1.55f, 0f, 1.22f), 12f, 0.74f, false);
            Place("Grass_03", vegetation, pond + new Vector3(-1.85f, 0f, 1.05f), 41f, 0.86f, false);
            float wy = IdyllicLayout.WaterHeight + 0.006f;
            Place("LilyPads_01", vegetation, pond + new Vector3(-0.62f, wy, 0.82f), 16f, 0.78f, false, false);
            Place("LilyPads_02", vegetation, pond + new Vector3(0.48f, wy, 0.68f), 48f, 0.7f, false, false);
            Place("Waterlily_01", vegetation, pond + new Vector3(-0.42f, wy, -0.62f), 28f, 0.72f, false, false);
        }

        static void PlaceGroves(Transform vegetation)
        {
            Place("BroadleafTree_03_Green", vegetation, new Vector3(-6.85f, 0f, -0.55f), 16f, 0.42f, true);
            Place("BroadleafTree_01_Green", vegetation, new Vector3(-7.25f, 0f, 2.15f), 38f, 0.44f, true);
            Place("BlossomTree_02", vegetation, new Vector3(-6.15f, 0f, 4.25f), 8f, 0.28f, true);
            Place("BroadleafTree_02_Green", vegetation, new Vector3(6.55f, 0f, -0.35f), 62f, 0.42f, true);
            Place("BroadleafTree_04_Green", vegetation, new Vector3(6.95f, 0f, 2.45f), 24f, 0.44f, true);
            Place("BlossomTree_04", vegetation, new Vector3(6.35f, 0f, 4.55f), 48f, 0.26f, true);
            Place("Bush_02_02", vegetation, new Vector3(-5.45f, 0f, 0.85f), 12f, 0.88f, false);
            Place("Bush_01_02", vegetation, new Vector3(-5.75f, 0f, 3.15f), 40f, 0.84f, false);
            Place("Bush_02_01", vegetation, new Vector3(5.55f, 0f, 1.05f), 28f, 0.86f, false);
            Place("Bush_01_01", vegetation, new Vector3(5.85f, 0f, 3.45f), 55f, 0.82f, false);
            Place("FlowerMeadow_Pink", vegetation, new Vector3(4.55f, 0f, 1.65f), 18f, 0.52f, false);
            Place("FlowerMeadow_Purple", vegetation, new Vector3(-4.85f, 0f, 3.55f), 36f, 0.5f, false);
            Place("FlowerMeadow_Orange", vegetation, new Vector3(4.15f, 0f, -0.85f), 22f, 0.48f, false);
        }

        static void PlaceGateGrove(Transform vegetation)
        {
            Vector3 gate = IdyllicLayout.GatePosition;
            Place("BlossomTree_01", vegetation, gate + new Vector3(-3.35f, 0f, 0.45f), 8f, 0.32f, true);
            Place("BlossomTree_03", vegetation, gate + new Vector3(3.42f, 0f, 0.52f), 26f, 0.34f, true);
            Place("BlossomTree_05", vegetation, gate + new Vector3(2.85f, 0f, 2.55f), 42f, 0.36f, true);
            Place("Bush_02_01", vegetation, gate + new Vector3(-2.55f, 0f, -0.82f), 14f, 0.78f, false);
            Place("Bush_01_01", vegetation, gate + new Vector3(2.62f, 0f, -0.78f), 50f, 0.8f, false);
            Place("Flower_Pink", vegetation, gate + new Vector3(-2.25f, 0f, 0.42f), 22f, 0.82f, false);
            Place("Flower_White", vegetation, gate + new Vector3(2.28f, 0f, 0.38f), 60f, 0.8f, false);
            Place("Flower_Purple", vegetation, gate + new Vector3(-2.85f, 0f, 0.72f), 18f, 0.78f, false);
        }

        static void ScatterProps(Transform props)
        {
            Place("Branch_02", props, new Vector3(3.15f, 0f, -1.72f), 33f, 0.48f, false);
        }

        static void BuildHedges(Transform vegetation)
        {
            Place("Bush_02_01", vegetation, new Vector3(-3.55f, 0f, -3.15f), 19f, 0.82f, false);
            Place("Bush_01_02", vegetation, new Vector3(3.65f, 0f, -3.22f), 41f, 0.8f, false);
        }

        static void BuildHills(Transform environment)
        {
            Place("BroadleafTree_04_Green", environment, new Vector3(-8.2f, 0f, 7.4f), 18f, 0.58f, true);
            Place("BroadleafTree_02_Green", environment, new Vector3(8.4f, 0f, 7.6f), 44f, 0.56f, true);
            Place("BroadleafTree_01_Green", environment, new Vector3(-4.4f, 0f, 10.6f), 10f, 0.54f, true);
            Place("BroadleafTree_05_Green", environment, new Vector3(4.6f, 0f, 10.8f), 52f, 0.52f, true);
            Place("Fir_03", environment, new Vector3(-9.4f, 0f, 10.2f), 8f, 0.68f, true);
            Place("Fir_05", environment, new Vector3(9.5f, 0f, 10.4f), 28f, 0.66f, true);
            Place("Fir_02", environment, new Vector3(0.15f, 0f, 13.4f), 14f, 0.78f, true);
            Place("BroadleafTree_03_Green", environment, new Vector3(-2.4f, 0f, 12.2f), 36f, 0.6f, true);
            Place("BroadleafTree_01_Green", environment, new Vector3(2.6f, 0f, 12.4f), 60f, 0.58f, true);
            Place("BroadleafTree_04_Green", environment, new Vector3(-6.2f, 0f, 12.6f), 22f, 0.62f, true);
            Place("BroadleafTree_02_Green", environment, new Vector3(6.4f, 0f, 12.8f), 48f, 0.6f, true);
            Place("Fir_03", environment, new Vector3(-3.6f, 0f, 14.2f), 6f, 0.72f, true);
            Place("Fir_05", environment, new Vector3(3.8f, 0f, 14.4f), 33f, 0.7f, true);
            Place("BlossomTree_02", environment, new Vector3(-5.1f, 0f, 9.4f), 16f, 0.34f, true);
            Place("BlossomTree_04", environment, new Vector3(5.3f, 0f, 9.6f), 40f, 0.32f, true);
            Place("Bush_02_01", environment, new Vector3(-7.4f, 0f, 8.8f), 22f, 1.02f, false);
            Place("Bush_01_01", environment, new Vector3(7.6f, 0f, 9.0f), 48f, 0.98f, false);
            var hills = PremiumKit.Place("meadow_hills", environment, new Vector3(0.2f, 0f, 16.4f), 180f, 1.35f, true);
            hills.name = "FarHills";
            var backdrop = PremiumKit.Place("background_hills", environment, new Vector3(-1.2f, 0f, 18.6f), 8f, 1.55f, true);
            backdrop.name = "BackdropHills";
        }

        static void Place(string prefab, Transform parent, Vector3 position, float yaw, float scale, bool obstacle, bool snapFeet = true)
        {
            var go = IdyllicKit.Place(prefab, parent, position, yaw, scale, snapFeet, obstacle);
            RecolorFoliage(go);
        }

        static void RecolorFoliage(GameObject go)
        {
            if (_active == null || go == null)
            {
                return;
            }

            var renderers = go.GetComponentsInChildren<Renderer>(true);
            for (int i = 0; i < renderers.Length; i++)
            {
                var source = renderers[i].sharedMaterials;
                var assigned = new Material[source.Length];
                for (int m = 0; m < source.Length; m++)
                {
                    assigned[m] = MapFoliage(source[m]);
                }

                renderers[i].sharedMaterials = assigned;
            }
        }

        static Material MapFoliage(Material source)
        {
            if (source == null)
            {
                return _active.ForestCanopy;
            }

            string name = source.name;
            if (name.Contains("Cattail") || name.Contains("Reed") || name.Contains("Reeds"))
            {
                return _active.GrassC;
            }

            if (name.Contains("LilyPad") || name.Contains("Lily_Pad"))
            {
                return _active.Lily;
            }

            if (name.Contains("Grass_01"))
            {
                return _active.GrassA;
            }

            if (name.Contains("Grass_03"))
            {
                return _active.GrassC;
            }

            if (name.Contains("Grass_"))
            {
                return _active.GrassB;
            }

            if (name.Contains("Bush_01"))
            {
                return _active.BushA;
            }

            if (name.Contains("Bush_03"))
            {
                return _active.BushC;
            }

            if (name.Contains("Bush_"))
            {
                return _active.BushB;
            }

            if (name.Contains("Fir_Branch"))
            {
                return _active.ForestFir;
            }

            if (name.Contains("Willow_Branch_Green") || name.Contains("Willow_Branch"))
            {
                return name.Contains("Red") || name.Contains("Pink") || name.Contains("Blue") || name.Contains("Purple")
                    ? source
                    : _active.ForestWillow;
            }

            if (name.Contains("Tree_Leaf_Green"))
            {
                return _active.ForestLeaf;
            }

            if (name.Contains("Broadleaf_Green"))
            {
                return _active.ForestCanopy;
            }

            return source;
        }

        static void ApplyAtmosphere(Material sky)
        {
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = Hex("F8E8C0");
            RenderSettings.ambientEquatorColor = Hex("D8C8A8");
            RenderSettings.ambientGroundColor = Hex("3A4A32");
            RenderSettings.ambientIntensity = 0.22f;
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = Hex("E8DCC8");
            RenderSettings.fogStartDistance = 13f;
            RenderSettings.fogEndDistance = 34f;
            RenderSettings.subtractiveShadowColor = Hex("8A6A50");
            RenderSettings.skybox = sky;
        }

        static void BuildLighting(Transform world)
        {
            var lighting = new GameObject("Lighting");
            lighting.transform.SetParent(world, false);
            var sun = new GameObject("Sun");
            sun.transform.SetParent(lighting.transform, false);
            sun.transform.rotation = Quaternion.Euler(36f, -42f, 0f);
            var light = sun.AddComponent<Light>();
            light.type = LightType.Directional;
            light.color = Hex("FFE6B0");
            light.intensity = 2.05f;
            light.shadows = LightShadows.Soft;
            light.shadowStrength = 0.72f;
            light.shadowBias = 0.04f;
            light.shadowNormalBias = 0.28f;
            sun.AddComponent<UniversalAdditionalLightData>();

            var fillGo = new GameObject("Fill");
            fillGo.transform.SetParent(lighting.transform, false);
            fillGo.transform.rotation = Quaternion.Euler(48f, 155f, 0f);
            var fill = fillGo.AddComponent<Light>();
            fill.type = LightType.Directional;
            fill.color = Hex("A8B8D0");
            fill.intensity = 0.07f;
            fill.shadows = LightShadows.None;
            fillGo.AddComponent<UniversalAdditionalLightData>();

            var rimGo = new GameObject("Rim");
            rimGo.transform.SetParent(lighting.transform, false);
            rimGo.transform.rotation = Quaternion.Euler(18f, 148f, 0f);
            var rim = rimGo.AddComponent<Light>();
            rim.type = LightType.Directional;
            rim.color = Hex("FFD9A0");
            rim.intensity = 0.16f;
            rim.shadows = LightShadows.None;
            rimGo.AddComponent<UniversalAdditionalLightData>();

            var probeGo = new GameObject("ReflectionProbe");
            probeGo.transform.SetParent(lighting.transform, false);
            probeGo.transform.position = IdyllicLayout.PondCenter + Vector3.up * 1.5f;
            var probe = probeGo.AddComponent<ReflectionProbe>();
            probe.mode = ReflectionProbeMode.Realtime;
            probe.refreshMode = ReflectionProbeRefreshMode.OnAwake;
            probe.timeSlicingMode = ReflectionProbeTimeSlicingMode.AllFacesAtOnce;
            probe.size = new Vector3(22f, 12f, 24f);
            probe.intensity = 0.95f;
            probe.hdr = true;

            var groupGo = new GameObject("LightProbes");
            groupGo.transform.SetParent(lighting.transform, false);
            var group = groupGo.AddComponent<LightProbeGroup>();
            var positions = new List<Vector3>();
            for (float x = -8f; x <= 8f; x += 4f)
            {
                for (float y = 0.4f; y <= 3.2f; y += 1.4f)
                {
                    for (float z = -6f; z <= 10f; z += 4f)
                    {
                        positions.Add(new Vector3(x, y, z));
                    }
                }
            }

            group.probePositions = positions.ToArray();
        }

        static void BuildVolume(Transform world)
        {
            AssetDatabase.DeleteAsset(VolumePath);
            var profile = ScriptableObject.CreateInstance<VolumeProfile>();
            var tone = profile.Add<Tonemapping>(true);
            tone.mode.Override(TonemappingMode.ACES);
            var bloom = profile.Add<Bloom>(true);
            bloom.intensity.Override(0.16f);
            bloom.threshold.Override(1.02f);
            bloom.scatter.Override(0.62f);
            var wb = profile.Add<WhiteBalance>(true);
            wb.temperature.Override(18f);
            wb.tint.Override(-2f);
            var color = profile.Add<ColorAdjustments>(true);
            color.postExposure.Override(0.02f);
            color.contrast.Override(24f);
            color.saturation.Override(14f);
            var shadows = profile.Add<ShadowsMidtonesHighlights>(true);
            shadows.shadows.Override(new Vector4(0.96f, 0.99f, 1.06f, 0f));
            shadows.midtones.Override(new Vector4(1.04f, 1.01f, 0.96f, 0f));
            shadows.highlights.Override(new Vector4(1.08f, 1.04f, 0.90f, 0f));
            var vignette = profile.Add<Vignette>(true);
            vignette.intensity.Override(0.04f);
            vignette.smoothness.Override(0.42f);
            AssetDatabase.CreateAsset(profile, VolumePath);

            var volumeGo = new GameObject("IdyllicVolume");
            volumeGo.transform.SetParent(world, false);
            var volume = volumeGo.AddComponent<Volume>();
            volume.isGlobal = true;
            volume.priority = 2f;
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
            camera.backgroundColor = Hex("E8D8B0");
            camera.fieldOfView = IdyllicLayout.CameraFov;
            camera.nearClipPlane = 0.22f;
            camera.farClipPlane = 46f;
            camera.allowHDR = true;
            var additional = camGo.AddComponent<UniversalAdditionalCameraData>();
            additional.renderPostProcessing = true;
            additional.renderShadows = true;
            additional.requiresDepthTexture = true;
            additional.requiresColorTexture = false;
            camGo.AddComponent<AudioListener>();
            var rig = cameraRig.AddComponent<ZooCameraRig>();
            rig.ConfigureCinematic(camera, IdyllicLayout.HeroCamera, IdyllicLayout.HeroFocus, new Vector2(2.6f, 0f));
            return camera;
        }

        static ZoneWaypoints BuildZones(Transform world)
        {
            var rootGo = Child(world, "HabitatZones");
            var root = rootGo.transform;
            var ground = MakeZone(root, "GroundZone", HabitatKind.Ground, new Vector3(0.2f, 0.55f, 1.5f), new Vector3(10.5f, 2.2f, 12.5f), GroundSpots(), 0.02f);
            var hop = MakeZone(root, "HopZone", HabitatKind.Hop, new Vector3(2.55f, 0.5f, 1.7f), new Vector3(4.2f, 1.8f, 6.6f), HopSpots(), 0.02f);
            var fly = MakeZone(root, "FlightZone", HabitatKind.Flight, new Vector3(0.2f, 2.35f, 1.5f), new Vector3(9.2f, 2.6f, 10.5f), FlySpots(), 0f);
            var water = MakeZone(root, "WaterZone", HabitatKind.Water, IdyllicLayout.PondCenter + Vector3.up * IdyllicLayout.WaterHeight, new Vector3(3.6f, 1.5f, 3.8f), FloatSpots(), 0f);
            MakeSpawnZone(root, "SpawnZoneWalk", LocomotionClass.Walk, GroundSpots(), 0.02f);
            MakeSpawnZone(root, "SpawnZoneHop", LocomotionClass.Hop, HopSpots(), 0.02f);
            MakeSpawnZone(root, "SpawnZoneFly", LocomotionClass.Fly, FlySpots(), 0f);
            MakeSpawnZone(root, "SpawnZoneFloat", LocomotionClass.Float, FloatSpots(), 0f);

            return new ZoneWaypoints
            {
                Ground = ground,
                Hop = hop,
                Fly = fly,
                Float = water,
                Spawn = new Transform[0]
            };
        }

        static Transform[] MakeZone(Transform parent, string name, HabitatKind kind, Vector3 center, Vector3 size, Vector3[] spots, float yOffset)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.position = center;
            var zone = go.AddComponent<HabitatZone>();
            zone.Configure(kind, size);
            return MakeWaypoints(go.transform, spots, yOffset);
        }

        static void MakeSpawnZone(Transform parent, string name, LocomotionClass locomotion, Vector3[] spots, float yOffset)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.position = Vector3.zero;
            var zone = go.AddComponent<HabitatZone>();
            zone.Configure(HabitatKind.Spawn, new Vector3(16f, 6f, 16f), locomotion);
            MakeWaypoints(go.transform, spots, yOffset);
        }

        static Transform[] MakeWaypoints(Transform parent, Vector3[] spots, float yOffset)
        {
            var points = new Transform[spots.Length];
            for (int i = 0; i < spots.Length; i++)
            {
                var wp = new GameObject("Wp" + i);
                wp.transform.SetParent(parent, false);
                wp.transform.position = spots[i] + Vector3.up * yOffset;
                points[i] = wp.transform;
            }

            return points;
        }

        static Vector3[] GroundSpots()
        {
            return new[]
            {
                new Vector3(0.18f, 0f, -0.42f),
                new Vector3(0.95f, 0f, 0.42f),
                new Vector3(0.22f, 0f, 1.55f),
                new Vector3(0.82f, 0f, 2.42f),
                new Vector3(0.08f, 0f, 3.48f),
                new Vector3(0.62f, 0f, 4.58f),
                new Vector3(0.18f, 0f, 5.52f),
                new Vector3(1.85f, 0f, -0.15f)
            };
        }

        static Vector3[] HopSpots()
        {
            return new[]
            {
                new Vector3(2.18f, 0f, 0.18f),
                new Vector3(2.58f, 0f, 1.48f),
                new Vector3(2.22f, 0f, 2.88f),
                new Vector3(2.65f, 0f, 4.18f)
            };
        }

        static Vector3[] FlySpots()
        {
            return new[]
            {
                new Vector3(-0.55f, 2.38f, -0.85f),
                new Vector3(1.68f, 2.58f, 0.38f),
                new Vector3(0.55f, 2.48f, 2.18f),
                new Vector3(-1.85f, 2.68f, 2.55f),
                new Vector3(1.18f, 2.78f, 4.08f)
            };
        }

        static Vector3[] FloatSpots()
        {
            Vector3 c = IdyllicLayout.PondCenter;
            float y = IdyllicLayout.WaterHeight + 0.02f;
            return new[]
            {
                c + new Vector3(-0.95f, y, -0.72f),
                c + new Vector3(0.72f, y, -0.55f),
                c + new Vector3(-0.55f, y, 0.85f),
                c + new Vector3(0.82f, y, 0.95f)
            };
        }

        static ArtDirectionAssets LoadCardAssets()
        {
            const string path = "Assets/VirtualZoo/Art/Creatures/Fixtures/ArtDirectionAssets.asset";
            var assets = AssetDatabase.LoadAssetAtPath<ArtDirectionAssets>(path);
            if (assets == null)
            {
                assets = ScriptableObject.CreateInstance<ArtDirectionAssets>();
                assets.CreatureSlab = PremiumKit.LoadMesh("creature_slab");
                assets.CreatureNub = PremiumKit.LoadMesh("creature_nub");
                assets.CardShader = AssetDatabase.LoadAssetAtPath<Shader>("Assets/VirtualZoo/Art/Shaders/CreatureCard.shader");
                AssetDatabase.CreateAsset(assets, path);
                assets = AssetDatabase.LoadAssetAtPath<ArtDirectionAssets>(path);
            }

            return assets;
        }

        static void ReplaceBrokenShaders()
        {
            var lit = Shader.Find("Universal Render Pipeline/Lit");
            var renderers = Object.FindObjectsByType<MeshRenderer>(FindObjectsInactive.Include, FindObjectsSortMode.None);
            for (int i = 0; i < renderers.Length; i++)
            {
                var mats = renderers[i].sharedMaterials;
                bool dirty = false;
                for (int m = 0; m < mats.Length; m++)
                {
                    if (mats[m] == null || mats[m].shader == null || mats[m].shader.name.Contains("InternalError"))
                    {
                        var fallback = new Material(lit);
                        fallback.color = Hex("6DB456");
                        string path = ArtFolder + "/Fallback_" + renderers[i].name + "_" + m + ".mat";
                        AssetDatabase.DeleteAsset(path);
                        AssetDatabase.CreateAsset(fallback, path);
                        mats[m] = AssetDatabase.LoadAssetAtPath<Material>(path);
                        dirty = true;
                    }
                }

                if (dirty)
                {
                    renderers[i].sharedMaterials = mats;
                }
            }
        }

        static GameObject CreateNamedMesh(string name, Transform parent, Mesh mesh, params Material[] materials)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            var filter = go.AddComponent<MeshFilter>();
            filter.sharedMesh = mesh;
            var renderer = go.AddComponent<MeshRenderer>();
            renderer.sharedMaterials = materials;
            renderer.receiveShadows = true;
            renderer.shadowCastingMode = ShadowCastingMode.On;
            return go;
        }

        static Mesh SaveMesh(string fileName, Mesh mesh)
        {
            string path = ArtFolder + "/" + fileName;
            AssetDatabase.DeleteAsset(path);
            AssetDatabase.CreateAsset(mesh, path);
            return AssetDatabase.LoadAssetAtPath<Mesh>(path);
        }

        static Texture2D LoadTex(string relative)
        {
            var tex = AssetDatabase.LoadAssetAtPath<Texture2D>(Vendor + relative);
            if (tex == null)
            {
                throw new System.InvalidOperationException("Missing Idyllic texture: " + relative);
            }

            return tex;
        }

        static Texture2D RecolorAlbedo(Texture2D source, string assetPath, float hue, float satMul, float valMul)
        {
            var rt = RenderTexture.GetTemporary(source.width, source.height, 0, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB);
            Graphics.Blit(source, rt);
            var prev = RenderTexture.active;
            RenderTexture.active = rt;
            var copy = new Texture2D(source.width, source.height, TextureFormat.RGBA32, false);
            copy.ReadPixels(new Rect(0f, 0f, source.width, source.height), 0, 0);
            copy.Apply();
            RenderTexture.active = prev;
            RenderTexture.ReleaseTemporary(rt);

            var pixels = copy.GetPixels();
            for (int i = 0; i < pixels.Length; i++)
            {
                Color c = pixels[i];
                Color.RGBToHSV(c, out float h, out float s, out float v);
                if (s > 0.12f && v > 0.18f)
                {
                    h = Mathf.Lerp(h, hue, 0.78f);
                    s *= satMul;
                    v *= valMul;
                }

                pixels[i] = Color.HSVToRGB(h, Mathf.Clamp01(s), Mathf.Clamp01(v));
            }

            copy.SetPixels(pixels);
            copy.Apply();
            WritePng(assetPath, copy, TextureWrapMode.Repeat);
            Object.DestroyImmediate(copy);
            return AssetDatabase.LoadAssetAtPath<Texture2D>(assetPath);
        }

        static Texture2D CreatePondDepthTexture(string assetPath)
        {
            const int size = 256;
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false);
            Color deep = Hex("163236");
            Color mid = Hex("3A5E5A");
            Color lip = Hex("5A6E52");
            for (int y = 0; y < size; y++)
            {
                for (int x = 0; x < size; x++)
                {
                    float u = x / (size - 1f) * 2f - 1f;
                    float v = y / (size - 1f) * 2f - 1f;
                    float r = Mathf.Sqrt(u * u + v * v);
                    Color c;
                    if (r < 0.52f)
                    {
                        c = Color.Lerp(deep, mid, r / 0.52f);
                        c.a = 0.88f;
                    }
                    else
                    {
                        c = Color.Lerp(mid, lip, Mathf.InverseLerp(0.52f, 1.05f, r));
                        c.a = Mathf.Lerp(0.8f, 0.48f, Mathf.InverseLerp(0.52f, 1.05f, r));
                    }

                    tex.SetPixel(x, y, c);
                }
            }

            tex.Apply();
            WritePng(assetPath, tex, TextureWrapMode.Clamp);
            Object.DestroyImmediate(tex);
            return AssetDatabase.LoadAssetAtPath<Texture2D>(assetPath);
        }

        static void WritePng(string assetPath, Texture2D tex, TextureWrapMode wrap)
        {
            string project = Directory.GetParent(UnityEngine.Application.dataPath).FullName;
            string full = Path.Combine(project, assetPath);
            Directory.CreateDirectory(Path.GetDirectoryName(full));
            File.WriteAllBytes(full, tex.EncodeToPNG());
            AssetDatabase.ImportAsset(assetPath);
            var importer = AssetImporter.GetAtPath(assetPath) as TextureImporter;
            if (importer != null)
            {
                importer.sRGBTexture = true;
                importer.wrapMode = wrap;
                importer.mipmapEnabled = true;
                importer.SaveAndReimport();
            }
        }

        static Material TexturedLit(Texture2D albedo, Texture2D normal, Color tint, float smoothness, Vector2 tiling)
        {
            var mat = ZooMaterials.CreateLit(tint);
            if (mat.HasProperty("_BaseMap") && albedo != null)
            {
                mat.SetTexture("_BaseMap", albedo);
                mat.SetTextureScale("_BaseMap", tiling);
            }

            mat.mainTexture = albedo;
            if (normal != null && mat.HasProperty("_BumpMap"))
            {
                mat.SetTexture("_BumpMap", normal);
                mat.EnableKeyword("_NORMALMAP");
            }

            if (mat.HasProperty("_Smoothness"))
            {
                mat.SetFloat("_Smoothness", smoothness);
            }

            if (mat.HasProperty("_BaseColor"))
            {
                mat.SetColor("_BaseColor", tint);
            }

            return mat;
        }

        static Material SolidLit(Color color, float smoothness)
        {
            var mat = ZooMaterials.CreateLit(color);
            if (mat.HasProperty("_Smoothness"))
            {
                mat.SetFloat("_Smoothness", smoothness);
            }

            return mat;
        }

        static Material Save(string path, Material material)
        {
            AssetDatabase.DeleteAsset(path);
            AssetDatabase.CreateAsset(material, path);
            return AssetDatabase.LoadAssetAtPath<Material>(path);
        }

        static GameObject Child(Transform parent, string name)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            return go;
        }

        static Color Hex(string hex)
        {
            ColorUtility.TryParseHtmlString("#" + hex, out var color);
            return color;
        }

        static void EnsureFolders()
        {
            CreateFolder("Assets", "VirtualZoo");
            CreateFolder("Assets/VirtualZoo", "Art");
            CreateFolder("Assets/VirtualZoo/Art", "IdyllicGarden");
            CreateFolder("Assets/VirtualZoo", "Scenes");
            CreateFolder("Assets/VirtualZoo/Art", "Creatures");
            CreateFolder("Assets/VirtualZoo/Art/Creatures", "Fixtures");
        }

        static void CreateFolder(string parent, string name)
        {
            string path = parent + "/" + name;
            if (!AssetDatabase.IsValidFolder(path))
            {
                AssetDatabase.CreateFolder(parent, name);
            }
        }

        static void DirectoryEnsure()
        {
            EnsureFolders();
        }

        static void EnsureBuildSettings()
        {
            var list = new List<EditorBuildSettingsScene>();
            bool hasGarden = false;
            bool hasArt = false;
            bool hasIdyllic = false;
            var existing = EditorBuildSettings.scenes;
            for (int i = 0; i < existing.Length; i++)
            {
                if (existing[i].path == ZooSceneBuilder.ScenePath)
                {
                    hasGarden = true;
                }

                if (existing[i].path == ZooArtDirectionBuilder.ScenePath)
                {
                    hasArt = true;
                }

                if (existing[i].path == ScenePath)
                {
                    hasIdyllic = true;
                }

                list.Add(existing[i]);
            }

            if (!hasGarden)
            {
                list.Insert(0, new EditorBuildSettingsScene(ZooSceneBuilder.ScenePath, true));
            }

            if (!hasArt)
            {
                list.Add(new EditorBuildSettingsScene(ZooArtDirectionBuilder.ScenePath, true));
            }

            if (!hasIdyllic)
            {
                list.Add(new EditorBuildSettingsScene(ScenePath, true));
            }

            EditorBuildSettings.scenes = list.ToArray();
        }
    }
}
