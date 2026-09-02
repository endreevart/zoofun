using UnityEngine;

namespace VirtualZoo.Presentation
{
    public sealed class DeveloperOverlay : MonoBehaviour
    {
        [SerializeField] bool _visible;
        [SerializeField] ZooDirector _director;

        float _accum;
        int _frames;
        float _fps = 60f;
        float _frameMs = 16.6f;
        float _soakSeconds;

        public bool Visible
        {
            get => _visible;
            set => _visible = value;
        }

        public void Bind(ZooDirector director)
        {
            _director = director;
        }

        void Update()
        {
            _soakSeconds += Time.unscaledDeltaTime;
            _accum += Time.unscaledDeltaTime;
            _frames++;
            if (_accum >= 0.4f)
            {
                _fps = _frames / _accum;
                _frameMs = 1000f / Mathf.Max(_fps, 0.01f);
                _accum = 0f;
                _frames = 0;
            }

            var keyboard = UnityEngine.InputSystem.Keyboard.current;
            if (keyboard != null && keyboard.dKey.wasPressedThisFrame && keyboard.leftShiftKey.isPressed)
            {
                _visible = !_visible;
            }
        }

        public OverlaySnapshot Snapshot()
        {
            int count = _director != null ? _director.ActiveCount : 0;
            return new OverlaySnapshot(count, _fps, _frameMs, _soakSeconds, UnityEngine.Profiling.Profiler.GetTotalAllocatedMemoryLong());
        }

        void OnGUI()
        {
            if (!_visible)
            {
                return;
            }

            var snap = Snapshot();
            var rect = new Rect(16f, 16f, 360f, 92f);
            GUI.color = new Color(1f, 1f, 1f, 0.88f);
            GUI.Box(rect, string.Empty);
            GUI.color = Color.white;
            GUI.Label(
                new Rect(28f, 24f, 340f, 80f),
                $"Animals: {snap.ActiveCreatures}\nFPS: {snap.Fps:0.0}  ({snap.FrameMs:0.0} ms)\nSoak: {snap.SoakSeconds:0.0}s");
        }
    }

    public readonly struct OverlaySnapshot
    {
        public OverlaySnapshot(int active, float fps, float frameMs, float soak, long memoryBytes)
        {
            ActiveCreatures = active;
            Fps = fps;
            FrameMs = frameMs;
            SoakSeconds = soak;
            MemoryBytes = memoryBytes;
        }

        public int ActiveCreatures { get; }
        public float Fps { get; }
        public float FrameMs { get; }
        public long MemoryBytes { get; }
        public float SoakSeconds { get; }
    }
}
