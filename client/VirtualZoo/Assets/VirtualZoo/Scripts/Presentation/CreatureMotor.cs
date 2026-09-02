using UnityEngine;
using UnityEngine.AI;
using VirtualZoo.Domain;

namespace VirtualZoo.Presentation
{
    public abstract class CreatureMotor : MonoBehaviour
    {
        protected CreatureManifest Manifest;
        protected Transform[] Waypoints;
        protected int Seed;
        protected ICreatureVisual Presentation;

        public LocomotionClass Locomotion { get; private set; }

        public void Bind(
            CreatureManifest manifest,
            Transform[] waypoints,
            int seed,
            ICreatureVisual presentation)
        {
            Manifest = manifest;
            Waypoints = waypoints;
            Seed = seed;
            Presentation = presentation;
            Locomotion = manifest.Locomotion;
        }

        protected Vector3 PickDestination(Vector3 current)
        {
            if (Waypoints == null || Waypoints.Length == 0)
            {
                return current;
            }

            int index = SeededRouteSelector.SelectIndex(
                Seed + Mathf.RoundToInt(Time.unscaledTime * 0.15f),
                Manifest.CreatureId,
                Waypoints.Length);
            return Waypoints[index].position;
        }
    }
}
