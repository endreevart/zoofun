using UnityEngine;
using UnityEngine.AI;
using VirtualZoo.Domain;

namespace VirtualZoo.Presentation
{
    [RequireComponent(typeof(NavMeshAgent))]
    public sealed class WalkLocomotion : CreatureMotor
    {
        NavMeshAgent _agent;
        float _repathAt;
        float _waddle;

        void Awake()
        {
            _agent = GetComponent<NavMeshAgent>();
        }

        void Start()
        {
            ConfigureAgent();
            Retarget();
        }

        void Update()
        {
            if (_agent == null || !_agent.isOnNavMesh)
            {
                return;
            }

            if (Time.time >= _repathAt || (!_agent.pathPending && _agent.remainingDistance <= _agent.stoppingDistance + 0.05f))
            {
                Retarget();
            }

            _waddle += Time.deltaTime * 7.5f;
            float sway = Mathf.Sin(_waddle) * 0.08f;
            if (Presentation != null)
            {
                Presentation.SetDeformation(1f - Mathf.Abs(sway) * 0.22f, 1f + Mathf.Abs(sway) * 0.12f);
            }
        }

        void ConfigureAgent()
        {
            _agent.speed = Manifest != null ? Manifest.MoveSpeed : 1.1f;
            _agent.angularSpeed = Manifest != null ? Manifest.TurnSpeed : 240f;
            _agent.acceleration = 4.2f;
            _agent.stoppingDistance = 0.45f;
            _agent.autoBraking = true;
            _agent.radius = 0.38f;
            _agent.height = 1.1f;
            _agent.obstacleAvoidanceType = ObstacleAvoidanceType.GoodQualityObstacleAvoidance;
        }

        void Retarget()
        {
            var rng = new SeededRng(Seed ^ (int)(Time.frameCount * 13));
            Vector3 dest = PickDestination(transform.position);
            dest += new Vector3(rng.Range(-1.2f, 1.2f), 0f, rng.Range(-1.2f, 1.2f));
            if (NavMesh.SamplePosition(dest, out var hit, 4f, NavMesh.AllAreas))
            {
                _agent.SetDestination(hit.position);
            }

            _repathAt = Time.time + rng.Range(3.5f, 7.5f);
        }
    }
}
