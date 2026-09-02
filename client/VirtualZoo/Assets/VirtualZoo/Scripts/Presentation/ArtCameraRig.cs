using UnityEngine;

namespace VirtualZoo.Presentation
{
    public sealed class ArtCameraRig : MonoBehaviour
    {
        [SerializeField] Camera _camera;
        [SerializeField] Vector3 _focus = ArtLayout.HeroFocus;
        [SerializeField] Vector3 _eye = ArtLayout.HeroCamera;
        [SerializeField] float _orbitRadius = 1.15f;

        Vector3 _baseEye;
        bool _frozen;

        public Camera Camera => _camera;

        public void Configure(Camera camera, Vector3 eye, Vector3 focus)
        {
            _camera = camera;
            _eye = eye;
            _focus = focus;
            _baseEye = eye;
            Apply(eye);
        }

        public void Freeze(bool frozen)
        {
            _frozen = frozen;
        }

        public void Apply(Vector3 eye)
        {
            if (_camera == null)
            {
                return;
            }

            _camera.transform.SetPositionAndRotation(eye, Quaternion.LookRotation((_focus - eye).normalized, Vector3.up));
        }

        public void NudgeForSoak(float time)
        {
            if (_frozen || _camera == null)
            {
                return;
            }

            Vector3 offset = new Vector3(
                Mathf.Sin(time * 0.18f) * _orbitRadius,
                0.12f * Mathf.Sin(time * 0.11f),
                Mathf.Cos(time * 0.16f) * _orbitRadius * 0.55f);
            Apply(_baseEye + offset);
        }

        void Awake()
        {
            if (_camera == null)
            {
                _camera = GetComponentInChildren<Camera>();
            }

            _baseEye = _eye;
            Apply(_eye);
        }
    }
}
