using System.Collections.Generic;
using UnityEngine;
using VirtualZoo.Application;
using VirtualZoo.Domain;
using VirtualZoo.Infrastructure;

namespace VirtualZoo.Presentation
{
    public sealed class ZooDirector : MonoBehaviour
    {
        [SerializeField] Transform _creatureRoot;
        [SerializeField] Transform[] _groundWaypoints;
        [SerializeField] Transform[] _hopWaypoints;
        [SerializeField] Transform[] _flyWaypoints;
        [SerializeField] Transform[] _floatWaypoints;
        [SerializeField] Transform[] _spawnWaypoints;
        [SerializeField] Camera _camera;
        [SerializeField] ArtDirectionAssets _cardAssets;
        [SerializeField] int _seed = 20260826;
        [SerializeField] Vector3 _boundsMin = new Vector3(-12f, -0.2f, -12f);
        [SerializeField] Vector3 _boundsMax = new Vector3(12f, 6.5f, 12f);

        readonly List<GameObject> _spawned = new List<GameObject>();
        CreatureFactory _factory;
        CreatureFactoryV2 _cardFactory;
        IFixtureCatalog _catalog;

        public int ActiveCount => _spawned.Count;
        public IReadOnlyList<GameObject> Spawned => _spawned;
        public Transform CreatureRoot => _creatureRoot;
        public int Seed => _seed;
        public Vector3 BoundsMin => _boundsMin;
        public Vector3 BoundsMax => _boundsMax;
        public bool UsesCardPresentation => _cardAssets != null;

        public int OwnedRuntimeAssetCount
        {
            get
            {
                int count = 0;
                for (int i = 0; i < _spawned.Count; i++)
                {
                    if (_spawned[i] == null)
                    {
                        continue;
                    }

                    var assets = _spawned[i].GetComponent<CreatureRuntimeAssets>();
                    if (assets != null)
                    {
                        count += assets.OwnedCount;
                    }
                }

                return count;
            }
        }

        public bool IsInsideBounds(Vector3 position, float padding = 0.35f)
        {
            return position.x >= _boundsMin.x - padding && position.x <= _boundsMax.x + padding &&
                   position.y >= _boundsMin.y - padding && position.y <= _boundsMax.y + padding &&
                   position.z >= _boundsMin.z - padding && position.z <= _boundsMax.z + padding;
        }

        public void Configure(
            Transform creatureRoot,
            Transform[] groundWaypoints,
            Transform[] flyWaypoints,
            Transform[] floatWaypoints,
            Camera camera,
            int seed,
            Vector3 boundsMin,
            Vector3 boundsMax)
        {
            _creatureRoot = creatureRoot;
            _groundWaypoints = groundWaypoints;
            _flyWaypoints = flyWaypoints;
            _floatWaypoints = floatWaypoints;
            _camera = camera;
            _seed = seed;
            _boundsMin = boundsMin;
            _boundsMax = boundsMax;
        }

        public void Configure(
            Transform creatureRoot,
            Transform[] groundWaypoints,
            Transform[] hopWaypoints,
            Transform[] flyWaypoints,
            Transform[] floatWaypoints,
            Transform[] spawnWaypoints,
            Camera camera,
            ArtDirectionAssets cardAssets,
            int seed,
            Vector3 boundsMin,
            Vector3 boundsMax)
        {
            Configure(creatureRoot, groundWaypoints, flyWaypoints, floatWaypoints, camera, seed, boundsMin, boundsMax);
            _hopWaypoints = hopWaypoints;
            _spawnWaypoints = spawnWaypoints;
            _cardAssets = cardAssets;
        }

        public void SetCatalog(IFixtureCatalog catalog)
        {
            _catalog = catalog;
        }

        void Awake()
        {
            Initialize();
        }

        void LateUpdate()
        {
            CreatureSpacingRegistry.Tick();
        }

        public void Initialize()
        {
            ClearSpawned();
            if (_camera == null)
            {
                _camera = Camera.main;
            }

            if (_creatureRoot == null)
            {
                var root = new GameObject("Creatures");
                root.transform.SetParent(transform, false);
                _creatureRoot = root.transform;
            }

            ResolveWaypointsFromZones();
            if (_cardAssets != null)
            {
                _cardFactory = new CreatureFactoryV2(
                    _camera,
                    _cardAssets.CreatureSlab,
                    _cardAssets.CreatureNub,
                    _cardAssets.CardShader,
                    IdyllicLayout.WaterHeight);
                _factory = null;
            }
            else
            {
                _factory = new CreatureFactory(_camera);
                _cardFactory = null;
            }

            var catalog = _catalog ?? new FileFixtureCatalog(FileFixtureCatalog.BundledRoot);
            var fixtures = catalog.LoadValidFixtures();
            var rng = new SeededRng(_seed);
            var occupied = new List<Vector3>();
            int cap = ReadCreatureCap();
            int perClass = cap < 20 ? Mathf.Max(1, cap / 4) : int.MaxValue;
            int[] taken = new int[4];
            int spawned = 0;

            for (int i = 0; i < fixtures.Count; i++)
            {
                var fixture = fixtures[i];
                int classIndex = ClassIndex(fixture.Manifest.Locomotion);
                if (taken[classIndex] >= perClass || spawned >= cap)
                {
                    continue;
                }

                Transform[] points = WaypointsFor(fixture.Manifest.Locomotion);
                var creature = _cardFactory != null
                    ? _cardFactory.Create(fixture, _creatureRoot, points, _seed + i * 17)
                    : _factory.Create(fixture, _creatureRoot, points, _seed + i * 17);
                if (creature == null)
                {
                    continue;
                }

                Vector3 spawn = SpawnPoint(fixture.Manifest.Locomotion, rng, points, occupied);
                occupied.Add(spawn);
                creature.transform.position = spawn;
                var agent = creature.GetComponent<UnityEngine.AI.NavMeshAgent>();
                if (agent != null && agent.isOnNavMesh)
                {
                    agent.Warp(spawn);
                }

                _spawned.Add(creature);
                taken[classIndex]++;
                spawned++;
            }
        }

        public bool IsInsideHabitat(LocomotionClass locomotion, Vector3 position, float padding = 1.6f)
        {
            var zone = HabitatZone.Find(IdyllicLayout.ZoneKindFor(locomotion));
            if (zone != null)
            {
                if (locomotion == LocomotionClass.Hop)
                {
                    var ground = HabitatZone.Find(HabitatKind.Ground);
                    return zone.Contains(position, padding) || (ground != null && ground.Contains(position, padding));
                }

                return zone.Contains(position, padding);
            }

            return IsInsideBounds(position, padding);
        }

        void ResolveWaypointsFromZones()
        {
            _groundWaypoints = FirstNonEmpty(_groundWaypoints, HabitatKind.Ground);
            _hopWaypoints = FirstNonEmpty(_hopWaypoints, HabitatKind.Hop);
            _flyWaypoints = FirstNonEmpty(_flyWaypoints, HabitatKind.Flight);
            _floatWaypoints = FirstNonEmpty(_floatWaypoints, HabitatKind.Water);
            _spawnWaypoints = FirstNonEmpty(_spawnWaypoints, HabitatKind.Spawn);
        }

        static Transform[] FirstNonEmpty(Transform[] current, HabitatKind kind)
        {
            if (current != null && current.Length > 0)
            {
                return current;
            }

            var zone = HabitatZone.Find(kind);
            return zone != null ? zone.CollectWaypoints() : current;
        }

        Transform[] WaypointsFor(LocomotionClass locomotion)
        {
            switch (locomotion)
            {
                case LocomotionClass.Fly:
                    return _flyWaypoints;
                case LocomotionClass.Float:
                    return _floatWaypoints;
                case LocomotionClass.Hop:
                    return _hopWaypoints != null && _hopWaypoints.Length > 0 ? _hopWaypoints : _groundWaypoints;
                default:
                    return _groundWaypoints;
            }
        }

        Vector3 SpawnPoint(LocomotionClass locomotion, SeededRng rng, Transform[] points, List<Vector3> occupied)
        {
            Transform[] spawn = SpawnPointsFor(locomotion);
            Transform[] source = spawn != null && spawn.Length > 0 ? spawn : points;
            if (source != null && source.Length > 0)
            {
                Vector3 best = source[0].position;
                float bestScore = -1f;
                for (int i = 0; i < source.Length; i++)
                {
                    Vector3 candidate = source[i].position;
                    float nearest = NearestOccupied(candidate, occupied);
                    if (nearest > bestScore)
                    {
                        bestScore = nearest;
                        best = candidate;
                    }
                }

                if (locomotion == LocomotionClass.Walk || locomotion == LocomotionClass.Hop)
                {
                    best.y = 0f;
                }

                if (locomotion == LocomotionClass.Float && HabitatZone.Find(HabitatKind.Water) != null)
                {
                    best.y = IdyllicLayout.WaterHeight + 0.02f;
                }

                return best;
            }

            return new Vector3(rng.Range(-4f, 4f), locomotion == LocomotionClass.Fly ? 2.6f : 0.2f, rng.Range(-4f, 4f));
        }

        static float NearestOccupied(Vector3 candidate, List<Vector3> occupied)
        {
            if (occupied == null || occupied.Count == 0)
            {
                return 100f;
            }

            float nearest = 100f;
            for (int i = 0; i < occupied.Count; i++)
            {
                Vector3 delta = occupied[i] - candidate;
                delta.y = 0f;
                float d = delta.magnitude;
                if (d < nearest)
                {
                    nearest = d;
                }
            }

            return nearest;
        }

        Transform[] SpawnPointsFor(LocomotionClass locomotion)
        {
            var spawnZones = HabitatZone.FindAll(HabitatKind.Spawn);
            if (spawnZones.Length == 0)
            {
                return _spawnWaypoints;
            }

            var matches = new List<Transform>();
            for (int i = 0; i < spawnZones.Length; i++)
            {
                if (spawnZones[i].SpawnLocomotion != locomotion)
                {
                    continue;
                }

                var points = spawnZones[i].CollectWaypoints();
                for (int p = 0; p < points.Length; p++)
                {
                    matches.Add(points[p]);
                }
            }

            return matches.Count > 0 ? matches.ToArray() : _spawnWaypoints;
        }

        static int ReadCreatureCap()
        {
            string env = System.Environment.GetEnvironmentVariable("ZOO_IDYLLIC_CREATURE_CAP");
            if (!string.IsNullOrEmpty(env) && int.TryParse(env, out int cap) && cap > 0)
            {
                return cap;
            }

            return int.MaxValue;
        }

        static int ClassIndex(LocomotionClass locomotion)
        {
            switch (locomotion)
            {
                case LocomotionClass.Hop:
                    return 1;
                case LocomotionClass.Fly:
                    return 2;
                case LocomotionClass.Float:
                    return 3;
                default:
                    return 0;
            }
        }

        void ClearSpawned()
        {
            for (int i = 0; i < _spawned.Count; i++)
            {
                ReleaseAndDestroy(_spawned[i]);
            }

            _spawned.Clear();
            CreatureSpacingRegistry.Clear();
            if (_creatureRoot == null)
            {
                return;
            }

            for (int i = _creatureRoot.childCount - 1; i >= 0; i--)
            {
                ReleaseAndDestroy(_creatureRoot.GetChild(i).gameObject);
            }
        }

        static void ReleaseAndDestroy(GameObject go)
        {
            if (go == null)
            {
                return;
            }

            go.SetActive(false);
            var assets = go.GetComponent<CreatureRuntimeAssets>();
            if (assets != null)
            {
                assets.Release();
            }

            if (UnityEngine.Application.isPlaying)
            {
                Destroy(go);
            }
            else
            {
                DestroyImmediate(go);
            }
        }
    }
}
