using UnityEngine;
using VirtualZoo.Domain;

namespace VirtualZoo.Presentation
{
    public sealed class CreaturePresentation : MonoBehaviour, ICreatureVisual
    {
        [SerializeField] Transform _visualRoot;
        [SerializeField] Transform _billboard;
        [SerializeField] SpriteRenderer _sprite;
        [SerializeField] Camera _camera;

        Vector3 _lastPosition;
        float _facing = 1f;
        float _squashY = 1f;
        float _stretchX = 1f;

        public Transform VisualRoot => _visualRoot;

        public void Configure(Transform visualRoot, Transform billboard, SpriteRenderer sprite, Camera camera)
        {
            _visualRoot = visualRoot;
            _billboard = billboard;
            _sprite = sprite;
            _camera = camera;
            _lastPosition = transform.position;
        }

        public void SetDeformation(float squashY, float stretchX)
        {
            _squashY = squashY;
            _stretchX = stretchX;
        }

        public void SetFacing(float facing)
        {
            _facing = facing >= 0f ? 1f : -1f;
        }

        void LateUpdate()
        {
            if (_billboard == null)
            {
                return;
            }

            var cam = _camera != null ? _camera : Camera.main;
            if (cam == null)
            {
                return;
            }

            Vector3 forward = cam.transform.forward;
            if (forward.sqrMagnitude > 0.0001f)
            {
                _billboard.rotation = Quaternion.LookRotation(forward, Vector3.up);
            }

            Vector3 delta = transform.position - _lastPosition;
            delta.y = 0f;
            if (delta.sqrMagnitude > 0.00004f)
            {
                float along = Vector3.Dot(delta.normalized, cam.transform.right);
                if (Mathf.Abs(along) > 0.08f)
                {
                    _facing = along >= 0f ? 1f : -1f;
                }
            }

            if (_visualRoot != null)
            {
                _visualRoot.localScale = new Vector3(_stretchX, _squashY, 1f);
            }

            if (_sprite != null)
            {
                _sprite.flipX = _facing < 0f;
            }

            var shadow = transform.Find("ContactShadow");
            if (shadow != null)
            {
                float surface = 0.02f;
                var identity = GetComponent<CreatureIdentity>();
                if (identity != null && identity.Locomotion == LocomotionClass.Float)
                {
                    surface = ZooLayout.WaterHeight + 0.008f;
                }

                Vector3 p = transform.position;
                shadow.position = new Vector3(p.x, surface, p.z);
            }

            _lastPosition = transform.position;
        }
    }
}
