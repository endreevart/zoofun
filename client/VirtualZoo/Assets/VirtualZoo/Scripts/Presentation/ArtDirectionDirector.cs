using System.Collections.Generic;
using UnityEngine;
using VirtualZoo.Application;
using VirtualZoo.Domain;
using VirtualZoo.Infrastructure;

namespace VirtualZoo.Presentation
{
    public sealed class ArtDirectionDirector : MonoBehaviour
    {
        [SerializeField] Transform _creatureRoot;
        [SerializeField] Transform[] _groundWaypoints;
        [SerializeField] Transform[] _flyWaypoints;
        [SerializeField] Transform[] _floatWaypoints;
        [SerializeField] Camera _camera;
        [SerializeField] ArtDirectionAssets _assets;
        [SerializeField] Mesh _creatureSlab;
        [SerializeField] Mesh _creatureNub;
        [SerializeField] Shader _cardShader;
        [SerializeField] int _seed = 20260827;
        [SerializeField] Vector3 _boundsMin = new Vector3(-8.5f, -0.2f, -8.5f);
        [SerializeField] Vector3 _boundsMax = new Vector3(8.5f, 6.5f, 10.5f);

        readonly List<GameObject> _spawned = new List<GameObject>();
        CreatureFactoryV2 _factory;
        IFixtureCatalog _catalog;

        public int ActiveCount => _spawned.Count;
        public IReadOnlyList<GameObject> Spawned => _spawned;
        public Transform CreatureRoot => _creatureRoot;

        public void Configure(
            Transform creatureRoot,
            Transform[] groundWaypoints,
            Transform[] flyWaypoints,
            Transform[] floatWaypoints,
            Camera camera,
            ArtDirectionAssets assets,
            int seed,
            Vector3 boundsMin,
            Vector3 boundsMax)
        {
            _creatureRoot = creatureRoot;
            _groundWaypoints = groundWaypoints;
            _flyWaypoints = flyWaypoints;
            _floatWaypoints = floatWaypoints;
            _camera = camera;
            _assets = assets;
            _creatureSlab = assets != null ? assets.CreatureSlab : null;
            _creatureNub = assets != null ? assets.CreatureNub : null;
            _cardShader = assets != null ? assets.CardShader : null;
            _seed = seed;
            _boundsMin = boundsMin;
            _boundsMax = boundsMax;
        }

        public void SetCatalog(IFixtureCatalog catalog)
        {
            _catalog = catalog;
        }

        void Awake()
        {
            Initialize();
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

            if (_assets != null)
            {
                if (_creatureSlab == null)
                {
                    _creatureSlab = _assets.CreatureSlab;
                }

                if (_creatureNub == null)
                {
                    _creatureNub = _assets.CreatureNub;
                }

                if (_cardShader == null)
                {
                    _cardShader = _assets.CardShader;
                }
            }

            _factory = new CreatureFactoryV2(_camera, _creatureSlab, _creatureNub, _cardShader, ArtLayout.WaterHeight);
            var catalog = _catalog ?? new FileFixtureCatalog(FileFixtureCatalog.BundledRoot);
            var fixtures = catalog.LoadValidFixtures();
            var rng = new SeededRng(_seed);

            for (int i = 0; i < fixtures.Count; i++)
            {
                var fixture = fixtures[i];
                if (fixture.Manifest == null || !ArtLayout.IsHeroFixture(fixture.Manifest.CreatureId, fixture.DirectoryPath))
                {
                    continue;
                }

                Transform[] points = WaypointsFor(fixture.Manifest.Locomotion);
                var creature = _factory.Create(fixture, _creatureRoot, points, _seed + i * 17);
                if (creature == null)
                {
                    continue;
                }

                Vector3 spawn = SpawnPoint(fixture.Manifest.Locomotion, rng, points);
                creature.transform.position = spawn;
                var agent = creature.GetComponent<UnityEngine.AI.NavMeshAgent>();
                if (agent != null && agent.isOnNavMesh)
                {
                    agent.Warp(spawn);
                }

                _spawned.Add(creature);
            }
        }

        Transform[] WaypointsFor(LocomotionClass locomotion)
        {
            switch (locomotion)
            {
                case LocomotionClass.Fly:
                    return _flyWaypoints;
                case LocomotionClass.Float:
                    return _floatWaypoints;
                default:
                    return _groundWaypoints;
            }
        }

        static Vector3 SpawnPoint(LocomotionClass locomotion, SeededRng rng, Transform[] points)
        {
            if (points != null && points.Length > 0)
            {
                var point = points[rng.Range(0, points.Length)].position;
                if (locomotion == LocomotionClass.Walk || locomotion == LocomotionClass.Hop)
                {
                    point.y = 0f;
                }

                return point;
            }

            return new Vector3(rng.Range(-3f, 3f), locomotion == LocomotionClass.Fly ? 2.2f : 0.2f, rng.Range(-3f, 3f));
        }

        void ClearSpawned()
        {
            for (int i = 0; i < _spawned.Count; i++)
            {
                ReleaseAndDestroy(_spawned[i]);
            }

            _spawned.Clear();
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
