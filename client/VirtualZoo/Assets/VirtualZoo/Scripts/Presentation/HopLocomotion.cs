using UnityEngine;
using UnityEngine.AI;
using VirtualZoo.Domain;

namespace VirtualZoo.Presentation
{
    [RequireComponent(typeof(NavMeshAgent))]
    public sealed class HopLocomotion : CreatureMotor
    {
        NavMeshAgent _agent;
        float _phase;
        float _repathAt;

        void Awake()
        {
            _agent = GetComponent<NavMeshAgent>();
        }

        void Start()
        {
            _agent.speed = Manifest != null ? Manifest.MoveSpeed : 1.4f;
            _agent.angularSpeed = Manifest != null ? Manifest.TurnSpeed : 280f;
            _agent.acceleration = 6f;
            _agent.stoppingDistance = 0.4f;
            _agent.autoBraking = true;
            _agent.radius = 0.34f;
            _agent.obstacleAvoidanceType = ObstacleAvoidanceType.GoodQualityObstacleAvoidance;
            _agent.baseOffset = 0f;
            Retarget();
        }

        void Update()
        {
            if (_agent == null || !_agent.isOnNavMesh)
            {
                return;
            }

            float speed = _agent.velocity.magnitude;
            float hopSpeed = 5.4f + speed * 0.8f;
            _phase += Time.deltaTime * hopSpeed;
            float wave = Mathf.Abs(Mathf.Sin(_phase));
            float lift = wave * 0.42f;
            float squash = 1f - wave * 0.18f;
            float stretch = 1f + wave * 0.12f;
            if (wave < 0.12f)
            {
                squash = 0.86f;
                stretch = 1.12f;
            }

            if (Presentation != null)
            {
                var visual = Presentation.VisualRoot;
                if (visual != null)
                {
                    var local = visual.localPosition;
                    visual.localPosition = new Vector3(local.x, lift, local.z);
                }

                Presentation.SetDeformation(squash, stretch);
            }

            if (Time.time >= _repathAt || (!_agent.pathPending && _agent.remainingDistance <= 0.5f))
            {
                Retarget();
            }
        }

        void Retarget()
        {
            var rng = new SeededRng(Seed + 91 + Time.frameCount);
            Vector3 dest = PickDestination(transform.position);
            dest += new Vector3(rng.Range(-0.8f, 0.8f), 0f, rng.Range(-0.8f, 0.8f));
            if (NavMesh.SamplePosition(dest, out var hit, 4f, NavMesh.AllAreas))
            {
                _agent.SetDestination(hit.position);
            }

            _repathAt = Time.time + rng.Range(2.8f, 6f);
        }
    }
}
