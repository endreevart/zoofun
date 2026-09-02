using System.Collections.Generic;
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
    public static class ZooArtDirectionBuilder
    {
        public const string ScenePath = "Assets/VirtualZoo/Scenes/ZooArtDirection.unity";
        const string VolumePath = "Assets/VirtualZoo/Art/Environment/ArtDirectionVolumeProfile.asset";
        const string SkyPath = "Assets/VirtualZoo/Art/Environment/ArtSkybox.mat";
        const string Tex = "Assets/VirtualZoo/Art/PremiumPrototype/Textures/";

        public static void Build()
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            EnsureFolders();
            ApplyAtmosphere();

            var world = new GameObject("ZooWorld");
            var art = new GameObject("Art");
            art.transform.SetParent(world.transform, false);
            var environment = Child(art.transform, "Environment");
            var props = Child(art.transform, "Props");
            var vegetation = Child(art.transform, "Vegetation");
            var architecture = Child(art.transform, "Architecture");

            var mats = CreateMaterials();
            BuildTerrain(environment.transform, mats);
            BuildArchitecture(architecture.transform, mats);
            ScatterVegetation(vegetation.transform, mats);
            ScatterProps(props.transform, mats);
            BuildLighting(world.transform);
            BuildVolume(world.transform);
            var camera = BuildCamera();

            var waypointRoot = new GameObject("Waypoints");
            waypointRoot.transform.SetParent(world.transform, false);
            var groundPts = MakeWaypoints(waypointRoot.transform, "Ground", GroundSpots(), 0.02f);
            var flyPts = MakeWaypoints(waypointRoot.transform, "Fly", FlySpots(), 0f);
            var floatPts = MakeWaypoints(waypointRoot.transform, "Float", FloatSpots(), 0f);

            var assetsPath = "Assets/VirtualZoo/Art/Creatures/Fixtures/ArtDirectionAssets.asset";
            AssetDatabase.DeleteAsset(assetsPath);
            var artAssets = ScriptableObject.CreateInstance<ArtDirectionAssets>();
            artAssets.CreatureSlab = PremiumKit.LoadMesh("creature_slab");
            artAssets.CreatureNub = PremiumKit.LoadMesh("creature_nub");
            artAssets.CardShader = AssetDatabase.LoadAssetAtPath<Shader>("Assets/VirtualZoo/Art/Shaders/CreatureCard.shader");
            AssetDatabase.CreateAsset(artAssets, assetsPath);
            artAssets = AssetDatabase.LoadAssetAtPath<ArtDirectionAssets>(assetsPath);

            var creatures = new GameObject("Creatures");
            var directorGo = new GameObject("ArtDirectionDirector");
            var director = directorGo.AddComponent<ArtDirectionDirector>();
            director.Configure(
                creatures.transform,
                groundPts,
                flyPts,
                floatPts,
                camera,
                artAssets,
                20260827,
                new Vector3(-8.5f, -0.2f, -8.5f),
                new Vector3(8.5f, 6.5f, 10.5f));

            var ground = GameObject.CreatePrimitive(PrimitiveType.Cube);
            ground.name = "Ground";
            ground.transform.SetParent(art.transform, false);
            ground.transform.position = new Vector3(0f, -0.16f, 0.4f);
            ground.transform.localScale = new Vector3(24f, 0.24f, 24f);
            ground.GetComponent<MeshRenderer>().enabled = false;
            ground.isStatic = true;

            var pondBlock = new GameObject("PondObstacle");
            pondBlock.transform.SetParent(environment.transform, false);
            pondBlock.transform.position = ArtLayout.PondCenter + Vector3.up * 0.2f;
            var obstacle = pondBlock.AddComponent<NavMeshObstacle>();
            obstacle.carving = true;
            obstacle.shape = NavMeshObstacleShape.Capsule;
            obstacle.center = Vector3.zero;
            obstacle.size = new Vector3(5.4f, 1.2f, 4.2f);

            var surface = ground.AddComponent<NavMeshSurface>();
            surface.collectObjects = CollectObjects.All;
            surface.useGeometry = NavMeshCollectGeometry.PhysicsColliders;
            surface.BuildNavMesh();

            DirectoryEnsure("Assets/VirtualZoo/Scenes");
            EditorSceneManager.SaveScene(scene, ScenePath);
            EnsureBuildSettings();
            EditorSceneManager.OpenScene(ScenePath);
        }

        static Materials CreateMaterials()
        {
            var grass = LoadTex("grass.png");
            var dirt = LoadTex("dirt.png");
            var wood = LoadTex("wood.png");
            var bark = LoadTex("bark.png");
            var leaf = LoadTex("leaf.png");
            var rock = LoadTex("rock.png");
            var stone = LoadTex("stone.png");
            var petal = LoadTex("petal.png");
            var foliage = AssetDatabase.LoadAssetAtPath<Shader>("Assets/VirtualZoo/Art/Shaders/PremiumFoliage.shader");

            var mats = new Materials
            {
                Meadow = Save("Assets/VirtualZoo/Art/Environment/Meadow.mat", TexturedLit(grass, Hex("F2FFE0"), 0.08f, new Vector2(2.2f, 2.2f))),
                Path = Save("Assets/VirtualZoo/Art/Environment/Path.mat", TexturedLit(dirt, Hex("FFE2A8"), 0.16f, new Vector2(2.1f, 2.1f))),
                Bank = Save("Assets/VirtualZoo/Art/Environment/PondBank.mat", TexturedLit(stone, Hex("C8C2B6"), 0.20f, new Vector2(2.0f, 2.0f))),
                Hills = Save("Assets/VirtualZoo/Art/Environment/Hills.mat", TexturedLit(grass, Hex("E0FFC0"), 0.08f, new Vector2(2.8f, 2.8f))),
                Burrow = Save("Assets/VirtualZoo/Art/Environment/Burrow.mat", TexturedLit(grass, Hex("E8FFCC"), 0.10f, new Vector2(2.2f, 2.2f))),
                Water = Save("Assets/VirtualZoo/Art/Environment/PondWater.mat", WaterSurface()),
                WaterDeep = Save("Assets/VirtualZoo/Art/Environment/PondDeep.mat", CartoonUnlit(null, Hex("2AA0D8"))),
                Foam = Save("Assets/VirtualZoo/Art/Environment/PondFoam.mat", CartoonUnlit(null, Hex("8FCB6A"))),
                Wood = Save("Assets/VirtualZoo/Art/Architecture/Wood.mat", TexturedLit(wood, Hex("C48A52"), 0.38f, new Vector2(2.2f, 2.2f))),
                Stone = Save("Assets/VirtualZoo/Art/Architecture/Stone.mat", TexturedLit(stone, Hex("C2B6A4"), 0.22f, new Vector2(2.4f, 2.4f))),
                TowerRoof = Save("Assets/VirtualZoo/Art/Architecture/TowerRoof.mat", TexturedLit(wood, Hex("B56A3C"), 0.32f, new Vector2(1.6f, 1.6f))),
                Bark = Save("Assets/VirtualZoo/Art/Vegetation/Bark.mat", TexturedLit(bark, Hex("7A5232"), 0.16f, new Vector2(2f, 3.2f))),
                LeafA = Save("Assets/VirtualZoo/Art/Vegetation/LeafA.mat", Foliage(foliage, leaf, Hex("F0FFE4"))),
                LeafB = Save("Assets/VirtualZoo/Art/Vegetation/LeafB.mat", Foliage(foliage, leaf, Hex("E8FFD2"))),
                LeafC = Save("Assets/VirtualZoo/Art/Vegetation/LeafC.mat", Foliage(foliage, leaf, Hex("D8F8C4"))),
                GrassTuft = Save("Assets/VirtualZoo/Art/Vegetation/GrassTuft.mat", Foliage(foliage, grass, Hex("68B054"))),
                Reed = Save("Assets/VirtualZoo/Art/Vegetation/Reed.mat", Foliage(foliage, leaf, Hex("4A8A4A"))),
                FlowerStem = Save("Assets/VirtualZoo/Art/Vegetation/FlowerStem.mat", Foliage(foliage, leaf, Hex("3F7A36"))),
                FlowerOrange = Save("Assets/VirtualZoo/Art/Vegetation/FlowerOrange.mat", TexturedLit(petal, Hex("F28A3C"), 0.28f, Vector2.one)),
                FlowerPurple = Save("Assets/VirtualZoo/Art/Vegetation/FlowerPurple.mat", TexturedLit(petal, Hex("B46AD2"), 0.28f, Vector2.one)),
                FlowerPink = Save("Assets/VirtualZoo/Art/Vegetation/FlowerPink.mat", TexturedLit(petal, Hex("F06AA0"), 0.28f, Vector2.one)),
                Rock = Save("Assets/VirtualZoo/Art/Props/Rock.mat", TexturedLit(rock, Hex("9A948C"), 0.18f, new Vector2(1.8f, 1.8f))),
                Paver = Save("Assets/VirtualZoo/Art/Props/Paver.mat", TexturedLit(stone, Hex("B8AEA0"), 0.24f, Vector2.one)),
                Lily = Save("Assets/VirtualZoo/Art/Props/Lily.mat", TexturedLit(leaf, Hex("5AAA52"), 0.22f, Vector2.one)),
                LanternWood = Save("Assets/VirtualZoo/Art/Props/LanternWood.mat", TexturedLit(wood, Hex("8A5A32"), 0.3f, Vector2.one)),
                LanternGlass = Save("Assets/VirtualZoo/Art/Props/LanternGlass.mat", Emission(Hex("FFD27A"), new Color(1.35f, 0.95f, 0.42f)))
            };
            return mats;
        }

        static void BuildTerrain(Transform parent, Materials mats)
        {
            var meadow = PremiumKit.Place("meadow_hills", parent, Vector3.zero, 0f, 1f, false, true);
            PremiumKit.SetMaterials(meadow, mats.Meadow);
            var path = PremiumKit.Place("path_ribbon", parent, Vector3.zero, 0f, 1f, false, true);
            PremiumKit.SetMaterials(path, mats.Path);
            var bank = PremiumKit.Place("pond_bank", parent, Vector3.zero, 0f, 1f, false, true);
            PremiumKit.SetMaterials(bank, mats.Bank);
            BuildHeroWater(parent, mats);
            var hills = PremiumKit.Place("background_hills", parent, Vector3.zero, 0f, 1f, false, true);
            PremiumKit.SetMaterials(hills, mats.Hills);
            var burrow = PremiumKit.Place("hill_burrow", parent, new Vector3(-6.45f, 0f, 1.85f), 28f, 1f, true, false, true, 2.15f);
            PremiumKit.SetMaterials(burrow, mats.Burrow);
        }

        static void BuildHeroWater(Transform parent, Materials mats)
        {
            var water = PremiumKit.Place("pond_water", parent, Vector3.zero, 0f, 1f, false, true);
            water.name = "PondWater";
            PremiumKit.SetMaterials(water, mats.Water);
            var waterRenderer = water.GetComponentInChildren<MeshRenderer>();
            if (waterRenderer != null)
            {
                waterRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                waterRenderer.receiveShadows = false;
            }

            water.AddComponent<WaterMotion>();
        }

        static Mesh SaveEnvMesh(string fileName, Mesh mesh)
        {
            string path = "Assets/VirtualZoo/Art/Environment/" + fileName;
            AssetDatabase.DeleteAsset(path);
            AssetDatabase.CreateAsset(mesh, path);
            return AssetDatabase.LoadAssetAtPath<Mesh>(path);
        }

        static GameObject CreateNamedMesh(string name, Transform parent, Mesh mesh, Material material)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            var filter = go.AddComponent<MeshFilter>();
            filter.sharedMesh = mesh;
            var renderer = go.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = material;
            renderer.receiveShadows = true;
            return go;
        }

        static void BuildArchitecture(Transform parent, Materials mats)
        {
            var bridge = PremiumKit.Place("bridge_round", parent, Vector3.zero, 0f, 1f, false, true, true);
            bridge.name = "Bridge";
            PremiumKit.SetMaterials(bridge, mats.Wood);
            var gate = PremiumKit.Place("gate_arch", parent, new Vector3(-0.55f, 0f, 8.35f), 0f, 1f, true, false, true, 3.35f);
            PremiumKit.SetMaterials(gate, mats.Stone);
            var tower = PremiumKit.Place("story_tower", parent, new Vector3(3.15f, 0f, 16.4f), 18f, 1f, true, false, true, 4.2f);
            PremiumKit.SetMaterials(tower, mats.Stone, mats.TowerRoof);
        }

        static void ScatterVegetation(Transform parent, Materials mats)
        {
            PlaceTree(parent, "tree_cloud_a", new Vector3(-6.85f, 0f, -3.55f), 18f, 4.55f, mats.Bark, mats.LeafA);
            PlaceTree(parent, "tree_cloud_b", new Vector3(6.45f, 0f, -2.85f), 42f, 3.85f, mats.Bark, mats.LeafB);
            PlaceTree(parent, "tree_cloud_c", new Vector3(-7.25f, 0f, 4.85f), 8f, 5.15f, mats.Bark, mats.LeafC);
            PlaceTree(parent, "tree_cloud_a", new Vector3(7.05f, 0f, 3.15f), 71f, 4.65f, mats.Bark, mats.LeafB);
            PlaceTree(parent, "tree_cloud_b", new Vector3(-5.35f, 0f, 7.25f), 24f, 3.55f, mats.Bark, mats.LeafA);
            PlaceTree(parent, "tree_cloud_c", new Vector3(5.15f, 0f, 8.55f), 56f, 4.35f, mats.Bark, mats.LeafC);
            PlaceTree(parent, "tree_cloud_a", new Vector3(-8.15f, 0f, 0.55f), 93f, 4.15f, mats.Bark, mats.LeafC);
            PlaceTree(parent, "tree_cloud_b", new Vector3(8.05f, 0f, -0.35f), 14f, 4.35f, mats.Bark, mats.LeafA);
            PlaceTree(parent, "tree_cloud_c", new Vector3(-7.55f, 0f, -4.85f), 77f, 3.95f, mats.Bark, mats.LeafB);
            PlaceTree(parent, "tree_cloud_a", new Vector3(7.55f, 0f, 6.35f), 16f, 4.85f, mats.Bark, mats.LeafA);
            PlaceTree(parent, "tree_cloud_b", new Vector3(-7.75f, 0f, 7.55f), 29f, 4.25f, mats.Bark, mats.LeafB);
            PlaceTree(parent, "tree_cloud_c", new Vector3(8.25f, 0f, -3.35f), 62f, 3.75f, mats.Bark, mats.LeafC);
            PlaceTree(parent, "tree_cloud_b", new Vector3(7.45f, 0f, -5.15f), 7f, 3.65f, mats.Bark, mats.LeafC);
            PlaceTree(parent, "tree_cloud_b", new Vector3(6.8f, 0f, 11.2f), 39f, 4.1f, mats.Bark, mats.LeafA);

            PlaceBush(parent, "bush_round_a", new Vector3(-5.8f, 0f, -4.7f), 10f, 0.95f, mats.LeafB);
            PlaceBush(parent, "bush_round_b", new Vector3(5.9f, 0f, -4.1f), 40f, 1.15f, mats.LeafA);
            PlaceBush(parent, "bush_round_a", new Vector3(6.6f, 0f, 1.8f), 8f, 1.05f, mats.LeafC);
            PlaceBush(parent, "bush_round_b", new Vector3(-6.7f, 0f, 1.9f), 70f, 0.88f, mats.LeafA);
            PlaceBush(parent, "bush_round_a", new Vector3(1.7f, 0f, 7.4f), 22f, 0.92f, mats.LeafB);
            PlaceBush(parent, "bush_round_b", new Vector3(-2.5f, 0f, 7.1f), 55f, 1.08f, mats.LeafC);
            PlaceBush(parent, "bush_round_a", new Vector3(-3.9f, 0f, -5.3f), 18f, 0.78f, mats.LeafA);
            PlaceBush(parent, "bush_round_b", new Vector3(3.4f, 0f, -5.6f), 64f, 0.82f, mats.LeafB);
            PlaceBush(parent, "bush_round_a", new Vector3(7.3f, 0f, 4.4f), 12f, 1.12f, mats.LeafC);
            PlaceBush(parent, "bush_round_b", new Vector3(-7.1f, 0f, 5.5f), 31f, 0.96f, mats.LeafB);
            PlaceBush(parent, "bush_round_a", new Vector3(0.4f, 0f, 9.2f), 44f, 0.9f, mats.LeafA);
            PlaceBush(parent, "bush_round_b", new Vector3(-4.8f, 0f, 3.6f), 6f, 0.84f, mats.LeafC);
            PlaceBush(parent, "bush_round_a", new Vector3(4.9f, 0f, 4.7f), 27f, 0.86f, mats.LeafB);
            PlaceBush(parent, "bush_round_b", new Vector3(-1.8f, 0f, -6.4f), 51f, 0.74f, mats.LeafA);
            PlaceBush(parent, "bush_round_a", new Vector3(1.1f, 0f, -6.8f), 15f, 0.7f, mats.LeafC);

            PlaceFlowerGroup(parent, new Vector3(-3.55f, 0f, -5.85f), mats.FlowerStem, mats.FlowerOrange, 0);
            PlaceFlowerGroup(parent, new Vector3(3.85f, 0f, -5.95f), mats.FlowerStem, mats.FlowerPurple, 1);
            PlaceFlowerGroup(parent, new Vector3(-6.05f, 0f, -2.15f), mats.FlowerStem, mats.FlowerPink, 2);
            PlaceFlowerGroup(parent, new Vector3(6.15f, 0f, -1.45f), mats.FlowerStem, mats.FlowerOrange, 3);
            PlaceFlowerGroup(parent, new Vector3(-5.25f, 0f, 5.45f), mats.FlowerStem, mats.FlowerPurple, 4);
            PlaceFlowerGroup(parent, new Vector3(5.05f, 0f, 5.85f), mats.FlowerStem, mats.FlowerPink, 5);
            PlaceFlowerGroup(parent, new Vector3(-2.15f, 0f, 6.55f), mats.FlowerStem, mats.FlowerOrange, 6);
            PlaceFlowerGroup(parent, new Vector3(2.35f, 0f, 6.75f), mats.FlowerStem, mats.FlowerPurple, 7);
            PlaceFlowerGroup(parent, new Vector3(4.25f, 0f, -3.25f), mats.FlowerStem, mats.FlowerPink, 8);
            PlaceFlowerGroup(parent, new Vector3(-4.45f, 0f, -3.55f), mats.FlowerStem, mats.FlowerOrange, 9);
            PlaceBush(parent, "bush_round_b", new Vector3(-2.6f, 0f, -3.8f), 19f, 0.72f, mats.LeafB);
            PlaceBush(parent, "bush_round_a", new Vector3(2.8f, 0f, -3.4f), 41f, 0.76f, mats.LeafA);
            PlaceBush(parent, "bush_round_b", new Vector3(-0.4f, 0f, 4.6f), 9f, 0.68f, mats.LeafC);
            PlaceBush(parent, "bush_round_a", new Vector3(3.1f, 0f, 1.1f), 33f, 0.7f, mats.LeafB);

            Vector3 c = ArtLayout.PondCenter;
            PlaceReed(parent, c + new Vector3(-0.2f, 0f, 1.85f), mats.Reed, 8f);
            PlaceReed(parent, c + new Vector3(0.45f, 0f, 1.72f), mats.Reed, 22f);
            PlaceReed(parent, c + new Vector3(0.95f, 0f, 1.42f), mats.Reed, 40f);
            PlaceReed(parent, c + new Vector3(-0.75f, 0f, 1.62f), mats.Reed, 55f);
            PlaceReed(parent, c + new Vector3(-1.15f, 0f, 1.15f), mats.Reed, 70f);
            PlaceReed(parent, c + new Vector3(-1.55f, 0f, 0.55f), mats.Reed, 88f);
            PlaceReed(parent, c + new Vector3(1.25f, 0f, 0.85f), mats.Reed, 102f);

            Vector3[] tufts =
            {
                new Vector3(-1.65f, 0f, -4.15f),
                new Vector3(1.85f, 0f, -4.55f),
                new Vector3(-2.35f, 0f, -3.15f),
                new Vector3(2.55f, 0f, -2.85f),
                new Vector3(-3.15f, 0f, -1.45f),
                new Vector3(3.25f, 0f, -1.15f),
                new Vector3(-3.85f, 0f, 0.35f),
                new Vector3(3.55f, 0f, 0.85f),
                new Vector3(-3.45f, 0f, 2.25f),
                new Vector3(3.15f, 0f, 2.55f),
                new Vector3(-2.15f, 0f, 4.15f),
                new Vector3(2.05f, 0f, 4.45f),
                new Vector3(0.75f, 0f, -3.65f),
                new Vector3(-0.85f, 0f, -3.85f),
                new Vector3(4.15f, 0f, -0.35f),
                new Vector3(-4.25f, 0f, -0.15f),
                new Vector3(1.15f, 0f, 5.15f),
                new Vector3(-1.35f, 0f, 5.35f),
                new Vector3(4.55f, 0f, -6.85f),
                new Vector3(-4.35f, 0f, -6.55f),
                new Vector3(2.65f, 0f, -7.25f),
                new Vector3(-2.45f, 0f, -7.05f)
            };
            for (int i = 0; i < tufts.Length; i++)
            {
                PlaceBush(parent, i % 2 == 0 ? "grass_tuft" : "bush_round_a", tufts[i], i * 17f, 0.38f + (i % 4) * 0.06f, i % 3 == 0 ? mats.LeafA : mats.GrassTuft);
            }

            PlaceFlowerGroup(parent, new Vector3(-3.15f, 0f, -7.15f), mats.FlowerStem, mats.FlowerOrange, 10);
            PlaceFlowerGroup(parent, new Vector3(3.45f, 0f, -7.35f), mats.FlowerStem, mats.FlowerPink, 11);
            PlaceFlowerGroup(parent, new Vector3(-1.25f, 0f, -6.45f), mats.FlowerStem, mats.FlowerPurple, 12);
            PlaceFlowerGroup(parent, new Vector3(0.85f, 0f, -6.75f), mats.FlowerStem, mats.FlowerOrange, 13);
            PlaceBush(parent, "bush_round_b", new Vector3(-3.55f, 0f, -7.45f), 14f, 0.95f, mats.LeafA);
            PlaceBush(parent, "bush_round_a", new Vector3(3.85f, 0f, -7.65f), 28f, 1.05f, mats.LeafB);
            PlaceBush(parent, "bush_round_b", new Vector3(-5.15f, 0f, 0.15f), 6f, 0.88f, mats.LeafC);
            PlaceBush(parent, "bush_round_a", new Vector3(5.35f, 0f, 0.45f), 19f, 0.92f, mats.LeafA);
            PlaceBush(parent, "bush_round_b", new Vector3(-4.15f, 0f, 6.15f), 33f, 0.78f, mats.LeafB);
            PlaceBush(parent, "bush_round_a", new Vector3(4.25f, 0f, 6.45f), 47f, 0.82f, mats.LeafC);
        }

        static void ScatterProps(Transform parent, Materials mats)
        {
            PlaceRock(parent, "rock_soft_c", new Vector3(3.55f, 0f, -7.85f), 18f, 1.12f, mats.Rock, true);
            PlaceRock(parent, "rock_soft_a", new Vector3(-3.25f, 0f, -7.65f), 44f, 0.82f, mats.Rock, true);
            PlaceRock(parent, "rock_soft_b", new Vector3(1.85f, 0f, -7.15f), 8f, 0.42f, mats.Rock, false);
            PlaceRock(parent, "rock_soft_c", new Vector3(-6.55f, 0f, -5.15f), 22f, 0.82f, mats.Rock, true);
            PlaceRock(parent, "rock_soft_a", new Vector3(6.85f, 0f, -5.75f), 66f, 0.58f, mats.Rock, false);
            PlaceRock(parent, "rock_soft_b", new Vector3(-2.15f, 0f, 8.85f), 15f, 0.4f, mats.Rock, false);
            PlaceRock(parent, "rock_soft_a", new Vector3(2.05f, 0f, 8.55f), 80f, 0.36f, mats.Rock, false);
            PlaceRock(parent, "rock_soft_b", new Vector3(ArtLayout.PondCenter.x + 2.05f, 0f, ArtLayout.PondCenter.z + 0.55f), 28f, 0.32f, mats.Rock, false);
            PlaceRock(parent, "rock_soft_a", new Vector3(ArtLayout.PondCenter.x + 1.85f, 0f, ArtLayout.PondCenter.z - 0.95f), 50f, 0.28f, mats.Rock, false);
            PlaceRock(parent, "rock_soft_c", new Vector3(ArtLayout.PondCenter.x + 1.15f, 0f, ArtLayout.PondCenter.z + 1.45f), 12f, 0.38f, mats.Rock, false);
            PlaceRock(parent, "rock_soft_b", new Vector3(ArtLayout.PondCenter.x - 0.35f, 0f, ArtLayout.PondCenter.z + 1.65f), 70f, 0.34f, mats.Rock, false);
            PlaceRock(parent, "rock_soft_a", new Vector3(ArtLayout.PondCenter.x - 1.85f, 0f, ArtLayout.PondCenter.z + 0.85f), 33f, 0.30f, mats.Rock, false);
            PlaceRock(parent, "rock_soft_c", new Vector3(ArtLayout.PondCenter.x - 2.05f, 0f, ArtLayout.PondCenter.z - 0.65f), 88f, 0.36f, mats.Rock, false);
            PlaceRock(parent, "rock_soft_b", new Vector3(ArtLayout.PondCenter.x - 0.75f, 0f, ArtLayout.PondCenter.z - 1.45f), 41f, 0.26f, mats.Rock, false);

            PlaceFence(parent, mats.Wood);

            Vector3[] pavers =
            {
                new Vector3(-0.55f, 0f, 7.35f),
                new Vector3(-0.15f, 0f, 6.75f),
                new Vector3(-0.85f, 0f, 6.95f),
                new Vector3(0.25f, 0f, 7.55f),
                new Vector3(-1.05f, 0f, 7.65f),
                new Vector3(-1.55f, 0f, -0.55f),
                new Vector3(-1.95f, 0f, 0.15f),
                new Vector3(-1.25f, 0f, 0.45f)
            };
            for (int i = 0; i < pavers.Length; i++)
            {
                var paver = PremiumKit.Place("stone_paver", parent, pavers[i], i * 18f, 1f, true, false, false, 0.07f);
                PremiumKit.SetMaterials(paver, mats.Paver);
            }

            Vector3 pond = ArtLayout.PondCenter;
            float wy = ArtLayout.WaterHeight + 0.012f;
            PlaceLily(parent, pond + new Vector3(-0.55f, wy, 0.45f), mats, 12f);
            PlaceLily(parent, pond + new Vector3(0.55f, wy, -0.35f), mats, 40f);
            PlaceLily(parent, pond + new Vector3(0.15f, wy, 0.72f), mats, 80f);
            PlaceLily(parent, pond + new Vector3(0.35f, wy, 0.12f), mats, 120f);
            PlaceLily(parent, pond + new Vector3(-0.85f, wy, -0.25f), mats, 64f);
            PlaceLily(parent, pond + new Vector3(-0.15f, wy, -0.65f), mats, 96f);
            PlaceLily(parent, pond + new Vector3(-1.15f, wy, 0.15f), mats, 150f);
            PlaceLily(parent, pond + new Vector3(0.75f, wy, 0.35f), mats, 200f);
        }

        static void PlaceTree(Transform parent, string model, Vector3 position, float yaw, float height, Material bark, Material leaf)
        {
            var go = PremiumKit.Place(model, parent, position, yaw, 1f, true, false, true, height, false);
            PremiumKit.SetMaterials(go, bark, leaf);
        }

        static void PlaceBush(Transform parent, string model, Vector3 position, float yaw, float height, Material leaf)
        {
            var go = PremiumKit.Place(model, parent, position, yaw, 1f, true, false, false, height, true);
            PremiumKit.SetMaterials(go, leaf);
        }

        static void PlaceFlowerGroup(Transform parent, Vector3 center, Material stem, Material petal, int seed)
        {
            string[] models = { "flower_cluster_a", "flower_cluster_b", "flower_cluster_c" };
            for (int i = 0; i < 5; i++)
            {
                float a = i / 5f * Mathf.PI * 2f + seed * 0.4f;
                var p = center + new Vector3(Mathf.Cos(a) * 0.28f, 0f, Mathf.Sin(a) * 0.28f);
                var go = PremiumKit.Place(models[(i + seed) % 3], parent, p, seed * 20f + i * 35f, 1f, true, false, false, 0.58f + (i % 3) * 0.08f, true);
                PremiumKit.SetMaterials(go, stem, petal);
            }
        }

        static void PlaceReed(Transform parent, Vector3 position, Material mat, float yaw)
        {
            var go = PremiumKit.Place("reed_cluster", parent, position, yaw, 1f, true, false, false, 0.95f, true);
            PremiumKit.SetMaterials(go, mat);
        }

        static void PlaceRock(Transform parent, string model, Vector3 position, float yaw, float height, Material mat, bool collider)
        {
            var go = PremiumKit.Place(model, parent, position, yaw, 1f, true, false, collider, height);
            PremiumKit.SetMaterials(go, mat);
        }

        static void PlaceLily(Transform parent, Vector3 position, Materials mats, float yaw)
        {
            var go = PremiumKit.Place("lily_pad", parent, position, yaw, 1f, false, false, false, 0.1f, true);
            PremiumKit.SetMaterials(go, mats.Lily, mats.FlowerPink);
        }

        static void PlaceFence(Transform parent, Material wood)
        {
            Vector3[] spots =
            {
                new Vector3(2.15f, 0f, -6.35f),
                new Vector3(2.55f, 0f, -4.85f),
                new Vector3(2.05f, 0f, -3.35f),
                new Vector3(2.75f, 0f, -1.85f),
                new Vector3(3.15f, 0f, -0.35f),
                new Vector3(3.05f, 0f, 1.15f),
                new Vector3(2.45f, 0f, 2.65f),
                new Vector3(1.85f, 0f, 4.15f),
                new Vector3(1.35f, 0f, 5.55f)
            };
            for (int i = 0; i < spots.Length; i++)
            {
                Vector3 next = i + 1 < spots.Length
                    ? spots[i + 1]
                    : spots[i] + new Vector3(-0.45f, 0f, 1.4f);
                Vector3 delta = next - spots[i];
                float yaw = Mathf.Atan2(delta.x, delta.z) * Mathf.Rad2Deg + 90f;
                var go = PremiumKit.Place("fence_rail", parent, spots[i], yaw, 1f, true, false, false, 0.95f);
                PremiumKit.SetMaterials(go, wood);
            }
        }

        static void PlaceLantern(Transform parent, Vector3 position, Materials mats)
        {
            var go = PremiumKit.Place("lantern", parent, position, 8f, 1f, true, false, false, 1.45f);
            PremiumKit.SetMaterials(go, mats.LanternWood, mats.LanternGlass);
            var lightGo = new GameObject("LanternLight");
            lightGo.transform.SetParent(go.transform, false);
            lightGo.transform.localPosition = new Vector3(0f, 1.22f, 0f);
            var light = lightGo.AddComponent<Light>();
            light.type = LightType.Point;
            light.color = Hex("FFD39A");
            light.intensity = 0.55f;
            light.range = 3.4f;
            light.shadows = LightShadows.None;
        }

        static void ApplyAtmosphere()
        {
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = Hex("FFE6C4");
            RenderSettings.ambientEquatorColor = Hex("9CB878");
            RenderSettings.ambientGroundColor = Hex("3A6A32");
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = Hex("E8DCC0");
            RenderSettings.fogStartDistance = 16f;
            RenderSettings.fogEndDistance = 46f;
            RenderSettings.subtractiveShadowColor = Hex("C4A888");
            RenderSettings.skybox = CreateSkybox();
        }

        static Material CreateSkybox()
        {
            var shader = Shader.Find("Skybox/Procedural");
            var sky = new Material(shader != null ? shader : Shader.Find("Hidden/InternalErrorShader"));
            if (sky.HasProperty("_SunDisk"))
            {
                sky.SetInt("_SunDisk", 2);
            }

            if (sky.HasProperty("_SunSize"))
            {
                sky.SetFloat("_SunSize", 0.045f);
            }

            if (sky.HasProperty("_AtmosphereThickness"))
            {
                sky.SetFloat("_AtmosphereThickness", 0.72f);
            }

            if (sky.HasProperty("_SkyTint"))
            {
                sky.SetColor("_SkyTint", Hex("C5DFF5"));
            }

            if (sky.HasProperty("_GroundColor"))
            {
                sky.SetColor("_GroundColor", Hex("7A9A58"));
            }

            if (sky.HasProperty("_Exposure"))
            {
                sky.SetFloat("_Exposure", 1.08f);
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
            sun.transform.rotation = Quaternion.Euler(26f, 72f, 0f);
            var light = sun.AddComponent<Light>();
            light.type = LightType.Directional;
            light.color = Hex("FFF3C8");
            light.intensity = 1.42f;
            light.shadows = LightShadows.Soft;
            light.shadowStrength = 0.56f;
            light.shadowBias = 0.04f;
            light.shadowNormalBias = 0.35f;

            var fillGo = new GameObject("Fill");
            fillGo.transform.SetParent(lighting.transform, false);
            fillGo.transform.rotation = Quaternion.Euler(22f, -78f, 0f);
            var fill = fillGo.AddComponent<Light>();
            fill.type = LightType.Directional;
            fill.color = Hex("D6E8FF");
            fill.intensity = 0.12f;
            fill.shadows = LightShadows.None;

            var bounceGo = new GameObject("Bounce");
            bounceGo.transform.SetParent(lighting.transform, false);
            bounceGo.transform.rotation = Quaternion.Euler(205f, 18f, 0f);
            var bounce = bounceGo.AddComponent<Light>();
            bounce.type = LightType.Directional;
            bounce.color = Hex("F6D0A0");
            bounce.intensity = 0.10f;
            bounce.shadows = LightShadows.None;

            var probeGo = new GameObject("ReflectionProbe");
            probeGo.transform.SetParent(lighting.transform, false);
            probeGo.transform.position = ArtLayout.PondCenter + Vector3.up * 1.4f;
            var probe = probeGo.AddComponent<ReflectionProbe>();
            probe.mode = ReflectionProbeMode.Realtime;
            probe.refreshMode = ReflectionProbeRefreshMode.OnAwake;
            probe.timeSlicingMode = ReflectionProbeTimeSlicingMode.AllFacesAtOnce;
            probe.size = new Vector3(22f, 12f, 22f);
            probe.intensity = 0.82f;
            probe.hdr = true;
            probe.shadowDistance = 24f;

            var groupGo = new GameObject("LightProbes");
            groupGo.transform.SetParent(lighting.transform, false);
            var group = groupGo.AddComponent<LightProbeGroup>();
            var positions = new List<Vector3>();
            for (float x = -8f; x <= 8f; x += 4f)
            {
                for (float y = 0.45f; y <= 3.4f; y += 1.4f)
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
            tone.mode.Override(TonemappingMode.Neutral);
            var bloom = profile.Add<Bloom>(true);
            bloom.intensity.Override(0.34f);
            bloom.threshold.Override(0.86f);
            bloom.scatter.Override(0.72f);
            var wb = profile.Add<WhiteBalance>(true);
            wb.temperature.Override(24f);
            wb.tint.Override(4f);
            var color = profile.Add<ColorAdjustments>(true);
            color.postExposure.Override(0.06f);
            color.contrast.Override(14f);
            color.saturation.Override(20f);
            color.hueShift.Override(0f);
            var vignette = profile.Add<Vignette>(true);
            vignette.intensity.Override(0.16f);
            vignette.smoothness.Override(0.42f);
            vignette.rounded.Override(true);
            var dof = profile.Add<DepthOfField>(true);
            dof.mode.Override(DepthOfFieldMode.Gaussian);
            dof.gaussianStart.Override(12f);
            dof.gaussianEnd.Override(28f);
            AssetDatabase.CreateAsset(profile, VolumePath);

            var volumeGo = new GameObject("ArtDirectionVolume");
            volumeGo.transform.SetParent(world, false);
            var volume = volumeGo.AddComponent<Volume>();
            volume.isGlobal = true;
            volume.priority = 2f;
            volume.sharedProfile = AssetDatabase.LoadAssetAtPath<VolumeProfile>(VolumePath);
        }

        static Camera BuildCamera()
        {
            var cameraRig = new GameObject("ArtCameraRig");
            var camGo = new GameObject("Main Camera");
            camGo.tag = "MainCamera";
            camGo.transform.SetParent(cameraRig.transform, false);
            var camera = camGo.AddComponent<Camera>();
            camera.clearFlags = CameraClearFlags.Skybox;
            camera.backgroundColor = Hex("C5DFF5");
            camera.fieldOfView = ArtLayout.HeroFov;
            camera.nearClipPlane = 0.25f;
            camera.farClipPlane = 80f;
            camera.allowHDR = true;
            var additional = camGo.AddComponent<UniversalAdditionalCameraData>();
            additional.renderPostProcessing = true;
            additional.renderShadows = true;
            additional.antialiasing = AntialiasingMode.SubpixelMorphologicalAntiAliasing;
            additional.antialiasingQuality = AntialiasingQuality.High;
            additional.requiresColorOption = CameraOverrideOption.On;
            additional.requiresDepthOption = CameraOverrideOption.On;
            camGo.AddComponent<AudioListener>();
            var rig = cameraRig.AddComponent<ArtCameraRig>();
            rig.Configure(camera, ArtLayout.HeroCamera, ArtLayout.HeroFocus);
            return camera;
        }

        static Vector3[] GroundSpots()
        {
            return new[]
            {
                new Vector3(2.25f, 0f, -2.45f),
                new Vector3(3.15f, 0f, -0.35f),
                new Vector3(2.95f, 0f, 1.95f),
                new Vector3(0.55f, 0f, 3.45f),
                new Vector3(-0.65f, 0f, -3.15f),
                new Vector3(3.55f, 0f, 0.85f),
                new Vector3(1.45f, 0f, 4.15f),
                new Vector3(-1.35f, 0f, 4.25f)
            };
        }

        static Vector3[] FlySpots()
        {
            return new[]
            {
                new Vector3(-0.6f, 1.95f, -0.35f),
                new Vector3(1.55f, 2.15f, 0.65f),
                new Vector3(2.65f, 1.85f, -0.85f),
                new Vector3(-2.85f, 2.05f, 2.15f),
                new Vector3(0.45f, 2.0f, 2.65f)
            };
        }

        static Vector3[] FloatSpots()
        {
            Vector3 c = ArtLayout.PondCenter;
            float y = ArtLayout.WaterHeight;
            return new[]
            {
                new Vector3(c.x - 0.85f, y, c.z + 0.25f),
                new Vector3(c.x - 0.55f, y, c.z - 0.45f),
                new Vector3(c.x - 0.15f, y, c.z + 0.55f),
                new Vector3(c.x - 1.05f, y, c.z - 0.15f)
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

        static GameObject Child(Transform parent, string name)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            return go;
        }

        static Texture2D LoadTex(string file)
        {
            var tex = AssetDatabase.LoadAssetAtPath<Texture2D>(Tex + file);
            if (tex == null)
            {
                throw new System.InvalidOperationException("Missing texture " + Tex + file);
            }

            return tex;
        }

        static Material TexturedLit(Texture2D tex, Color tint, float smoothness, Vector2 tiling)
        {
            var mat = ZooMaterials.CreateLit(tint);
            if (tex != null)
            {
                if (mat.HasProperty("_BaseMap"))
                {
                    mat.SetTexture("_BaseMap", tex);
                }

                mat.mainTexture = tex;
                mat.mainTextureScale = tiling;
                if (mat.HasProperty("_BaseMap"))
                {
                    mat.SetTextureScale("_BaseMap", tiling);
                }
            }

            if (mat.HasProperty("_Smoothness"))
            {
                mat.SetFloat("_Smoothness", smoothness);
            }

            return mat;
        }

        static Material Foliage(Shader shader, Texture2D tex, Color tint)
        {
            if (shader == null)
            {
                return TexturedLit(tex, tint, 0.16f, new Vector2(2f, 2f));
            }

            var mat = new Material(shader);
            mat.SetTexture("_BaseMap", tex);
            mat.mainTexture = tex;
            if (mat.HasProperty("_BaseColor"))
            {
                mat.SetColor("_BaseColor", tint);
            }

            if (mat.HasProperty("_SwayAmp"))
            {
                mat.SetFloat("_SwayAmp", 0.045f);
            }

            if (mat.HasProperty("_Wrap"))
            {
                mat.SetFloat("_Wrap", 0.74f);
            }

            return mat;
        }

        static Material CartoonUnlit(Texture2D tex, Color tint)
        {
            var shader = Shader.Find("Universal Render Pipeline/Unlit");
            if (shader == null)
            {
                return TexturedLit(tex, tint, 0.12f, new Vector2(2.2f, 2.2f));
            }

            var mat = new Material(shader);
            if (mat.HasProperty("_BaseColor"))
            {
                mat.SetColor("_BaseColor", tint);
            }

            if (mat.HasProperty("_Color"))
            {
                mat.SetColor("_Color", tint);
            }

            if (tex != null)
            {
                if (mat.HasProperty("_BaseMap"))
                {
                    mat.SetTexture("_BaseMap", tex);
                    mat.SetTextureScale("_BaseMap", new Vector2(2.2f, 2.2f));
                }

                mat.mainTexture = tex;
                mat.mainTextureScale = new Vector2(2.2f, 2.2f);
            }

            return mat;
        }

        static Material WaterSurface()
        {
            var shader = AssetDatabase.LoadAssetAtPath<Shader>("Assets/VirtualZoo/Art/Shaders/PremiumWater.shader");
            if (shader != null)
            {
                var water = new Material(shader);
                water.SetColor("_ShallowColor", new Color(0.28f, 0.72f, 0.95f, 1f));
                water.SetColor("_DeepColor", new Color(0.08f, 0.42f, 0.78f, 1f));
                water.SetColor("_FoamColor", new Color(0.78f, 0.90f, 0.86f, 1f));
                water.SetFloat("_WaveAmp", 0.02f);
                water.SetFloat("_WaveSpeed", 0.9f);
                water.SetFloat("_Gloss", 0.86f);
                return water;
            }

            var mat = ZooMaterials.CreateLit(new Color(0.22f, 0.78f, 0.74f, 1f), false);
            if (mat.HasProperty("_Smoothness"))
            {
                mat.SetFloat("_Smoothness", 0.9f);
            }

            return mat;
        }

        static Material Emission(Color albedo, Color emission)
        {
            var mat = ZooMaterials.CreateLit(albedo);
            if (mat.HasProperty("_Smoothness"))
            {
                mat.SetFloat("_Smoothness", 0.72f);
            }

            mat.EnableKeyword("_EMISSION");
            if (mat.HasProperty("_EmissionColor"))
            {
                mat.SetColor("_EmissionColor", emission);
            }

            return mat;
        }

        static Material Save(string path, Material material)
        {
            AssetDatabase.DeleteAsset(path);
            AssetDatabase.CreateAsset(material, path);
            return AssetDatabase.LoadAssetAtPath<Material>(path);
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
            CreateFolder("Assets/VirtualZoo/Art", "Environment");
            CreateFolder("Assets/VirtualZoo/Art", "Props");
            CreateFolder("Assets/VirtualZoo/Art", "Vegetation");
            CreateFolder("Assets/VirtualZoo/Art", "Architecture");
            CreateFolder("Assets/VirtualZoo/Art", "Creatures");
            CreateFolder("Assets/VirtualZoo/Art/Creatures", "Fixtures");
            CreateFolder("Assets/VirtualZoo/Art", "Shaders");
            CreateFolder("Assets/VirtualZoo/Art", "PremiumPrototype");
            CreateFolder("Assets/VirtualZoo", "Scenes");
        }

        static void CreateFolder(string parent, string name)
        {
            string path = parent + "/" + name;
            if (!AssetDatabase.IsValidFolder(path))
            {
                AssetDatabase.CreateFolder(parent, name);
            }
        }

        static void DirectoryEnsure(string assetPath)
        {
            EnsureFolders();
            if (!AssetDatabase.IsValidFolder(assetPath))
            {
                AssetDatabase.CreateFolder("Assets/VirtualZoo", "Scenes");
            }
        }

        static void EnsureBuildSettings()
        {
            var list = new List<EditorBuildSettingsScene>();
            bool hasGarden = false;
            bool hasArt = false;
            var existing = EditorBuildSettings.scenes;
            for (int i = 0; i < existing.Length; i++)
            {
                if (existing[i].path == ZooSceneBuilder.ScenePath)
                {
                    hasGarden = true;
                }

                if (existing[i].path == ScenePath)
                {
                    hasArt = true;
                }

                list.Add(existing[i]);
            }

            if (!hasGarden)
            {
                list.Insert(0, new EditorBuildSettingsScene(ZooSceneBuilder.ScenePath, true));
            }

            if (!hasArt)
            {
                list.Add(new EditorBuildSettingsScene(ScenePath, true));
            }

            EditorBuildSettings.scenes = list.ToArray();
        }

        sealed class Materials
        {
            public Material Meadow;
            public Material Path;
            public Material Bank;
            public Material Hills;
            public Material Burrow;
            public Material Water;
            public Material WaterDeep;
            public Material Foam;
            public Material Wood;
            public Material Stone;
            public Material TowerRoof;
            public Material Bark;
            public Material LeafA;
            public Material LeafB;
            public Material LeafC;
            public Material GrassTuft;
            public Material Reed;
            public Material FlowerStem;
            public Material FlowerOrange;
            public Material FlowerPurple;
            public Material FlowerPink;
            public Material Rock;
            public Material Paver;
            public Material Lily;
            public Material LanternWood;
            public Material LanternGlass;
        }
    }
}
