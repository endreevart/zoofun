using UnityEngine;
using UnityEngine.InputSystem;

namespace VirtualZoo.Presentation
{
    public sealed class ZooCameraRig : MonoBehaviour
    {
        [SerializeField] Camera _camera;
        [SerializeField] Vector3 _lookAt = new Vector3(0f, 0.4f, 0f);
        [SerializeField] Vector2 _panBounds = new Vector2(3.2f, 0f);
        [SerializeField] float _minDistance = 12.4f;
        [SerializeField] float _maxDistance = 16.8f;
        [SerializeField] float _minHeight = 5.8f;
        [SerializeField] float _maxHeight = 8.2f;
        [SerializeField] float _panSensitivity = 0.014f;
        [SerializeField] float _smooth = 8f;
        [SerializeField] Vector3 _planOffset = new Vector3(0f, 6.95f, -15.1f);

        Vector3 _focus;
        bool _dragging;
        Vector2 _lastPointer;
        bool _frozen;

        public Camera Camera => _camera;
        public Vector3 FocusPoint => _focus;

        public void Configure(Camera camera, Vector3 lookAt, Vector2 panBounds)
        {
            _camera = camera;
            _lookAt = lookAt;
            _panBounds = new Vector2(panBounds.x, 0f);
            _focus = lookAt;
        }

        public void ConfigureCinematic(Camera camera, Vector3 eye, Vector3 lookAt, Vector2 panBounds)
        {
            _camera = camera;
            _lookAt = lookAt;
            _panBounds = new Vector2(Mathf.Max(panBounds.x, 0.1f), 0f);
            _planOffset = eye - lookAt;
            _minDistance = _planOffset.magnitude;
            _maxDistance = _minDistance;
            _minHeight = eye.y;
            _maxHeight = eye.y;
            _focus = lookAt;
            Apply(true);
        }

        public void Freeze(bool frozen)
        {
            _frozen = frozen;
        }

        public void PanPixels(Vector2 pixelDelta)
        {
            Pan(pixelDelta);
            Apply(true);
        }

        void Awake()
        {
            if (_camera == null)
            {
                _camera = GetComponentInChildren<Camera>();
            }

            _focus = _lookAt;
            Apply(true);
        }

        void Update()
        {
            if (_frozen)
            {
                return;
            }

            HandleMouse();
            HandleTouch();
            Apply(false);
        }

        void HandleMouse()
        {
            var mouse = Mouse.current;
            if (mouse == null)
            {
                return;
            }

            if (mouse.leftButton.wasPressedThisFrame)
            {
                _dragging = true;
                _lastPointer = mouse.position.ReadValue();
            }

            if (mouse.leftButton.wasReleasedThisFrame)
            {
                _dragging = false;
            }

            if (_dragging && mouse.leftButton.isPressed)
            {
                Vector2 pos = mouse.position.ReadValue();
                Vector2 delta = pos - _lastPointer;
                _lastPointer = pos;
                Pan(-delta);
            }
        }

        void HandleTouch()
        {
            var touchscreen = Touchscreen.current;
            if (touchscreen == null)
            {
                return;
            }

            int count = 0;
            foreach (var touch in touchscreen.touches)
            {
                if (touch.isInProgress)
                {
                    count++;
                }
            }

            if (count == 1)
            {
                var t = touchscreen.primaryTouch;
                if (t.press.wasPressedThisFrame)
                {
                    _dragging = true;
                    _lastPointer = t.position.ReadValue();
                }

                if (_dragging)
                {
                    Vector2 pos = t.position.ReadValue();
                    Pan(-(pos - _lastPointer));
                    _lastPointer = pos;
                }
            }
            else
            {
                _dragging = false;
            }
        }

        void Pan(Vector2 pixelDelta)
        {
            if (_camera == null)
            {
                return;
            }

            Vector3 right = Vector3.ProjectOnPlane(_camera.transform.right, Vector3.up).normalized;
            _focus += right * pixelDelta.x * _panSensitivity;
            _focus.x = Mathf.Clamp(_focus.x, _lookAt.x - _panBounds.x, _lookAt.x + _panBounds.x);
            _focus.z = _lookAt.z;
            _focus.y = _lookAt.y;
        }

        void Apply(bool instant)
        {
            if (_camera == null)
            {
                return;
            }

            Vector3 targetPos = _focus + _planOffset;
            if (instant)
            {
                _camera.transform.position = targetPos;
            }
            else
            {
                _camera.transform.position = Vector3.Lerp(_camera.transform.position, targetPos, Time.deltaTime * _smooth);
            }

            Quaternion look = Quaternion.LookRotation((_focus - _camera.transform.position).normalized, Vector3.up);
            _camera.transform.rotation = instant ? look : Quaternion.Slerp(_camera.transform.rotation, look, Time.deltaTime * _smooth);
        }

        public void NudgeForSoak(float time)
        {
            _focus.x = _lookAt.x + Mathf.Sin(time * 0.12f) * Mathf.Min(1.15f, _panBounds.x);
            _focus.z = _lookAt.z;
            _focus.y = _lookAt.y;
        }
    }
}
