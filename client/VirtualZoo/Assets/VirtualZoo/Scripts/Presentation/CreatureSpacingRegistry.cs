using System.Collections.Generic;
using UnityEngine;
using VirtualZoo.Domain;

namespace VirtualZoo.Presentation
{
    public static class CreatureSpacingRegistry
    {
        const float MinGround = 1.35f;
        const float MinAir = 1.15f;
        const float MinWater = 1.05f;

        static readonly List<CreatureIdentity> Actives = new List<CreatureIdentity>(24);

        public static int Count => Actives.Count;

        public static void Register(CreatureIdentity identity)
        {
            if (identity == null)
            {
                return;
            }

            if (!Actives.Contains(identity))
            {
                Actives.Add(identity);
            }
        }

        public static void Unregister(CreatureIdentity identity)
        {
            if (identity == null)
            {
                return;
            }

            Actives.Remove(identity);
        }

        public static void Clear()
        {
            Actives.Clear();
        }

        public static bool HasDuplicates()
        {
            var seen = new HashSet<int>();
            for (int i = 0; i < Actives.Count; i++)
            {
                if (Actives[i] == null)
                {
                    continue;
                }

                if (!seen.Add(Actives[i].GetInstanceID()))
                {
                    return true;
                }
            }

            return false;
        }

        public static void Tick()
        {
            for (int i = Actives.Count - 1; i >= 0; i--)
            {
                if (Actives[i] == null)
                {
                    Actives.RemoveAt(i);
                }
            }

            HabitatZone ground = HabitatZone.Find(HabitatKind.Ground);
            HabitatZone hop = HabitatZone.Find(HabitatKind.Hop);
            HabitatZone flight = HabitatZone.Find(HabitatKind.Flight);
            HabitatZone water = HabitatZone.Find(HabitatKind.Water);

            for (int i = 0; i < Actives.Count; i++)
            {
                CreatureIdentity identity = Actives[i];
                if (!identity.isActiveAndEnabled)
                {
                    continue;
                }

                float min = MinFor(identity.Locomotion);
                Vector3 push = Vector3.zero;
                Vector3 position = identity.transform.position;
                for (int j = 0; j < Actives.Count; j++)
                {
                    if (i == j)
                    {
                        continue;
                    }

                    CreatureIdentity other = Actives[j];
                    if (other == null || other.Locomotion != identity.Locomotion)
                    {
                        continue;
                    }

                    Vector3 delta = position - other.transform.position;
                    if (identity.Locomotion != LocomotionClass.Fly)
                    {
                        delta.y = 0f;
                    }

                    float dist = delta.magnitude;
                    if (dist < 0.001f || dist >= min)
                    {
                        continue;
                    }

                    push += delta.normalized * ((min - dist) * 0.45f);
                }

                if (push.sqrMagnitude < 0.0001f)
                {
                    continue;
                }

                Vector3 next = position + push;
                HabitatZone zone = ZoneFor(identity.Locomotion, ground, hop, flight, water);
                if (zone != null && !zone.Contains(next, 0.8f))
                {
                    continue;
                }

                identity.transform.position = next;
                var agent = identity.GetComponent<UnityEngine.AI.NavMeshAgent>();
                if (agent != null && agent.isOnNavMesh)
                {
                    agent.Warp(next);
                }
            }
        }

        static HabitatZone ZoneFor(
            LocomotionClass locomotion,
            HabitatZone ground,
            HabitatZone hop,
            HabitatZone flight,
            HabitatZone water)
        {
            switch (locomotion)
            {
                case LocomotionClass.Hop:
                    return hop;
                case LocomotionClass.Fly:
                    return flight;
                case LocomotionClass.Float:
                    return water;
                default:
                    return ground;
            }
        }

        static float MinFor(LocomotionClass locomotion)
        {
            switch (locomotion)
            {
                case LocomotionClass.Fly:
                    return MinAir;
                case LocomotionClass.Float:
                    return MinWater;
                default:
                    return MinGround;
            }
        }
    }
}
