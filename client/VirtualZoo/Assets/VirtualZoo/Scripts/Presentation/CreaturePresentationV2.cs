using UnityEngine;
using VirtualZoo.Domain;

namespace VirtualZoo.Presentation
{
    public sealed class CreaturePresentationV2 : MonoBehaviour, ICreatureVisual
    {
        [SerializeField] Transform _visualRoot;
        [SerializeField] Transform _swayRoot;
        [SerializeField] Transform _earLeft;
        [SerializeField] Transform _earRight;
        [SerializeField] Transform _tail;
        [SerializeField] Transform _pawLeft;
        [SerializeField] Transform _pawRight;
        [SerializeField] Camera _camera;
        [SerializeField] float _waterHeight;

        Vector3 _lastPosition;
        float _facing = 1f;
        float _squashY = 1f;
        float _stretchX = 1f;
        float _sway;
        Quaternion _earLeftBase;
        Quaternion _earRightBase;
        Quaternion _tailBase;
        Quaternion _pawLeftBase;
        Quaternion _pawRightBase;

        public Transform VisualRoot => _visualRoot;

        public void Configure(
            Transform visualRoot,
            Transform swayRoot,
            Transform earLeft,
            Transform earRight,
            Transform tail,
            Transform pawLeft,
            Transform pawRight,
            Camera camera,
            float waterHeight)
        {
            _visualRoot = visualRoot;
            _swayRoot = swayRoot;
            _earLeft = earLeft;
            _earRight = earRight;
            _tail = tail;
            _pawLeft = pawLeft;
            _pawRight = pawRight;
            _camera = camera;
            _waterHeight = waterHeight;
            _lastPosition = transform.position;
            CacheBases();
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

        void Awake()
        {
            CacheBases();
        }

        void CacheBases()
        {
            if (_earLeft != null)
            {
                _earLeftBase = _earLeft.localRotation;
            }

            if (_earRight != null)
            {
                _earRightBase = _earRight.localRotation;
            }

            if (_tail != null)
            {
                _tailBase = _tail.localRotation;
            }

            if (_pawLeft != null)
            {
                _pawLeftBase = _pawLeft.localRotation;
            }

            if (_pawRight != null)
            {
                _pawRightBase = _pawRight.localRotation;
            }
        }

        public void BillboardNow()
        {
            if (_swayRoot == null)
            {
                return;
            }

            var cam = _camera != null ? _camera : Camera.main;
            if (cam == null)
            {
                return;
            }

            Vector3 toCam = cam.transform.position - transform.position;
            if (toCam.sqrMagnitude < 0.0001f)
            {
                return;
            }

            Vector3 face = toCam.normalized;
            Vector3 up = Vector3.up;
            Vector3 right = Vector3.Cross(up, face);
            if (right.sqrMagnitude < 0.0001f)
            {
                right = cam.transform.right;
            }

            right.Normalize();
            Vector3 flatForward = Vector3.Cross(right, up).normalized;
            Vector3 blended = Vector3.Slerp(flatForward, face, 0.82f);
            _swayRoot.rotation = Quaternion.LookRotation(blended, up);
            Vector3 swayScale = _swayRoot.localScale;
            swayScale.x = Mathf.Abs(swayScale.x) * _facing;
            _swayRoot.localScale = swayScale;
        }

        void LateUpdate()
        {
            if (_swayRoot == null)
            {
                return;
            }

            var cam = _camera != null ? _camera : Camera.main;
            BillboardNow();
            Quaternion yaw = _swayRoot.rotation;

            Vector3 delta = transform.position - _lastPosition;
            delta.y = 0f;
            if (delta.sqrMagnitude > 0.00004f && cam != null)
            {
                float along = Vector3.Dot(delta.normalized, cam.transform.right);
                if (Mathf.Abs(along) > 0.08f)
                {
                    _facing = along >= 0f ? 1f : -1f;
                }
            }

            _sway += Time.deltaTime * 2.3f;
            float body = Mathf.Sin(_sway) * 4.2f;
            _swayRoot.rotation = yaw * Quaternion.Euler(0f, 0f, body);
            Vector3 swayScale = _swayRoot.localScale;
            swayScale.x = Mathf.Abs(swayScale.x) * _facing;
            _swayRoot.localScale = swayScale;

            if (_visualRoot != null)
            {
                _visualRoot.localScale = new Vector3(_stretchX, _squashY, 1f);
            }

            Wiggle(_earLeft, _earLeftBase, 8.5f, 1.7f, 0.4f);
            Wiggle(_earRight, _earRightBase, -7.5f, 1.85f, 0.9f);
            Wiggle(_tail, _tailBase, 11f, 2.4f, 1.3f);
            Wiggle(_pawLeft, _pawLeftBase, 5.5f, 3.1f, 0.2f);
            Wiggle(_pawRight, _pawRightBase, -5.5f, 3.1f, 1.6f);

            var shadow = transform.Find("ContactShadow");
            if (shadow != null)
            {
                float surface = 0.018f;
                var identity = GetComponent<CreatureIdentity>();
                if (identity != null && identity.Locomotion == LocomotionClass.Float)
                {
                    surface = _waterHeight + 0.01f;
                }

                Vector3 p = transform.position;
                shadow.position = new Vector3(p.x, surface, p.z);
            }

            _lastPosition = transform.position;
        }

        void Wiggle(Transform target, Quaternion baseRot, float amp, float speed, float phase)
        {
            if (target == null)
            {
                return;
            }

            float wave = Mathf.Sin(Time.time * speed + phase);
            target.localRotation = baseRot * Quaternion.Euler(wave * amp * 0.35f, wave * amp, 0f);
        }
    }
}
