using UnityEngine;
using VirtualZoo.Domain;

namespace VirtualZoo.Presentation
{
    public sealed class FlyLocomotion : CreatureMotor
    {
        int _index;
        Vector3 _velocity;
        float _bob;

        void Start()
        {
            _index = SeededRouteSelector.SelectIndex(Seed, Manifest != null ? Manifest.CreatureId : "fly", WaypointCount);
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
            float speed = Manifest != null ? Manifest.MoveSpeed : 1.6f;
            Vector3 desired = to.normalized * speed;
            _velocity = Vector3.Lerp(_velocity, desired, Time.deltaTime * 1.8f);
            transform.position += _velocity * Time.deltaTime;

            if (to.magnitude < 0.55f)
            {
                _index = (_index + 1) % WaypointCount;
            }

            _bob += Time.deltaTime * 2.4f;
            if (Presentation != null && Presentation.VisualRoot != null)
            {
                var local = Presentation.VisualRoot.localPosition;
                Presentation.VisualRoot.localPosition = new Vector3(local.x, 0.08f + Mathf.Sin(_bob) * 0.12f, local.z);
                Presentation.SetDeformation(1f + Mathf.Sin(_bob * 2f) * 0.04f, 1f);
            }
        }
    }
}
