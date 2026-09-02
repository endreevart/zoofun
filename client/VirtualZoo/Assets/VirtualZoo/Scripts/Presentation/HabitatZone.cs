using System.Collections.Generic;
using UnityEngine;
using VirtualZoo.Domain;

namespace VirtualZoo.Presentation
{
    public sealed class HabitatZone : MonoBehaviour
    {
        [SerializeField] HabitatKind _kind;
        [SerializeField] Vector3 _size = new Vector3(8f, 2f, 8f);
        [SerializeField] LocomotionClass _spawnLocomotion;

        static readonly List<HabitatZone> Registered = new List<HabitatZone>(16);

        public HabitatKind Kind => _kind;
        public Vector3 Size => _size;
        public LocomotionClass SpawnLocomotion => _spawnLocomotion;

        public static int RegisteredCount
        {
            get
            {
                Compact();
                return Registered.Count;
            }
        }

        public void Configure(HabitatKind kind, Vector3 size, LocomotionClass spawnLocomotion = LocomotionClass.Walk)
        {
            _kind = kind;
            _size = size;
            _spawnLocomotion = spawnLocomotion;
            Register(this);
        }

        public bool Contains(Vector3 worldPosition, float padding = 0f)
        {
            Vector3 local = transform.InverseTransformPoint(worldPosition);
            Vector3 half = _size * 0.5f;
            half.x += padding;
            half.y += padding;
            half.z += padding;
            return Mathf.Abs(local.x) <= half.x &&
                   Mathf.Abs(local.y) <= half.y &&
                   Mathf.Abs(local.z) <= half.z;
        }

        public Transform[] CollectWaypoints()
        {
            var list = new List<Transform>();
            for (int i = 0; i < transform.childCount; i++)
            {
                var child = transform.GetChild(i);
                if (child != null && child.name.StartsWith("Wp"))
                {
                    list.Add(child);
                }
            }

            return list.ToArray();
        }

        void OnEnable()
        {
            Register(this);
        }

        void OnDisable()
        {
            Unregister(this);
        }

        public static void Register(HabitatZone zone)
        {
            if (zone == null)
            {
                return;
            }

            if (!Registered.Contains(zone))
            {
                Registered.Add(zone);
            }
        }

        public static void Unregister(HabitatZone zone)
        {
            if (zone == null)
            {
                return;
            }

            Registered.Remove(zone);
        }

        public static void ClearRegistry()
        {
            Registered.Clear();
        }

        public static HabitatZone Find(HabitatKind kind)
        {
            Compact();
            for (int i = 0; i < Registered.Count; i++)
            {
                HabitatZone zone = Registered[i];
                if (zone != null && zone.isActiveAndEnabled && zone.Kind == kind)
                {
                    return zone;
                }
            }

            return null;
        }

        public static HabitatZone[] FindAll(HabitatKind kind)
        {
            Compact();
            var list = new List<HabitatZone>();
            for (int i = 0; i < Registered.Count; i++)
            {
                HabitatZone zone = Registered[i];
                if (zone != null && zone.isActiveAndEnabled && zone.Kind == kind)
                {
                    list.Add(zone);
                }
            }

            return list.ToArray();
        }

        static void Compact()
        {
            for (int i = Registered.Count - 1; i >= 0; i--)
            {
                if (Registered[i] == null)
                {
                    Registered.RemoveAt(i);
                }
            }
        }
    }
}
