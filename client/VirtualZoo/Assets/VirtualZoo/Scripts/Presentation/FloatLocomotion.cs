using UnityEngine;
using VirtualZoo.Domain;

namespace VirtualZoo.Presentation
{
    public sealed class FloatLocomotion : CreatureMotor
    {
        int _index;
        Vector3 _velocity;
        float _hover;

        void Start()
        {
            _index = SeededRouteSelector.SelectIndex(Seed + 17, Manifest != null ? Manifest.CreatureId : "float", WaypointCount);
            if (WaypointCount > 0)
            {
                transform.position = Waypoints[_index].position;
            }
        }

        int WaypointCount => Waypoints != null ? Waypoints.Length : 0;

        void Update()
        {
            if (WaypointCount == 0)
            {
                return;
            }

            Vector3 target = Waypoints[_index].position;
            Vector3 to = target - transform.position;
            float speed = Manifest != null ? Manifest.MoveSpeed * 0.7f : 0.7f;
            _velocity = Vector3.Lerp(_velocity, to.normalized * speed, Time.deltaTime * 1.2f);
            transform.position += _velocity * Time.deltaTime;

            if (to.magnitude < 0.4f)
            {
                _index = (_index + 1) % WaypointCount;
            }

            _hover += Time.deltaTime * 1.7f;
            if (Presentation != null && Presentation.VisualRoot != null)
            {
                var local = Presentation.VisualRoot.localPosition;
                Presentation.VisualRoot.localPosition = new Vector3(local.x, 0.02f + Mathf.Sin(_hover) * 0.04f, local.z);
                Presentation.SetDeformation(1f + Mathf.Sin(_hover) * 0.03f, 1f - Mathf.Sin(_hover) * 0.02f);
            }
        }
    }
}
