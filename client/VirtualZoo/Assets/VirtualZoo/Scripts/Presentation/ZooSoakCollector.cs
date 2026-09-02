using System.Globalization;
using System.Text;
using UnityEngine;
using UnityEngine.Profiling;
using VirtualZoo.Domain;

namespace VirtualZoo.Presentation
{
    public sealed class ZooSoakCollector : MonoBehaviour
    {
        FrameTimeSampler _sampler;
        ZooCameraRig _rig;
        ArtCameraRig _artRig;
        ZooDirector _director;
        ArtDirectionDirector _artDirector;
        float _duration = 300f;
        int _errors;
        int _warnings;
        bool _complete;
        FrameSamplerReport _report;
        readonly StringBuilder _console = new StringBuilder();

        public bool IsComplete => _complete;
        public FrameSamplerReport Report => _report;
        public float ElapsedSeconds => _sampler != null ? _sampler.ElapsedSeconds : 0f;
        public string ConsoleText => _console.ToString();
        public int ProjectErrors => _errors;
        public int ProjectWarnings => _warnings;

        public int ActiveCreatures
        {
            get
            {
                if (_director != null)
                {
                    return _director.ActiveCount;
                }

                return _artDirector != null ? _artDirector.ActiveCount : 0;
            }
        }

        public void Configure(float duration, ZooCameraRig rig, ZooDirector director)
        {
            _duration = duration;
            _rig = rig;
            _director = director;
        }

        public void ConfigureArt(float duration, ArtCameraRig rig, ArtDirectionDirector director)
        {
            _duration = duration;
            _artRig = rig;
            _artDirector = director;
        }

        void OnEnable()
        {
            UnityEngine.Application.logMessageReceived += OnLog;
        }

        void OnDisable()
        {
            UnityEngine.Application.logMessageReceived -= OnLog;
        }

        void Start()
        {
            UnityEngine.Application.targetFrameRate = 60;
            QualitySettings.vSyncCount = 1;
            _sampler = new FrameTimeSampler(FrameTimeSampler.DefaultWarmupSeconds);
            _sampler.Begin(Profiler.GetTotalAllocatedMemoryLong(), Time.realtimeSinceStartup);
        }

        void Update()
        {
            if (_complete || _sampler == null || !_sampler.Begun)
            {
                return;
            }

            _sampler.SampleFrame(Time.realtimeSinceStartup, Time.unscaledDeltaTime, Profiler.GetTotalAllocatedMemoryLong());
            if (_rig != null)
            {
                _rig.NudgeForSoak(_sampler.ElapsedSeconds);
            }

            if (_artRig != null)
            {
                _artRig.NudgeForSoak(_sampler.ElapsedSeconds);
            }

            if (_sampler.ElapsedSeconds >= _duration)
            {
                _report = _sampler.Finish();
                _complete = true;
            }
        }

        void OnLog(string condition, string stackTrace, LogType type)
        {
            bool editorSearch = (!string.IsNullOrEmpty(stackTrace) && stackTrace.Contains("UnityEditor.Search")) ||
                                (!string.IsNullOrEmpty(condition) && condition.Contains("SearchDatabase"));
            _console.AppendLine((editorSearch ? "EditorSearch " : "") + type + ": " + condition);
            if (editorSearch)
            {
                return;
            }

            if (type == LogType.Error || type == LogType.Exception)
            {
                _errors++;
            }

            if (type == LogType.Warning)
            {
                _warnings++;
            }
        }

        public static string FormatReport(FrameSamplerReport report, int activeCreatures, int errors, int warnings)
        {
            var sb = new StringBuilder();
            sb.AppendLine("{");
            Write(sb, "soakSeconds", report.SoakSeconds);
            Write(sb, "warmupSeconds", report.WarmupSeconds);
            sb.AppendLine("  \"capturePerformed\": false,");
            sb.AppendFormat(CultureInfo.InvariantCulture, "  \"totalGameplayFrames\": {0},\n", report.TotalGameplayFrames);
            sb.AppendFormat(CultureInfo.InvariantCulture, "  \"sampleCount\": {0},\n", report.SampleCount);
            Write(sb, "fpsAverage", report.FpsAverage);
            Write(sb, "fpsMin", report.FpsMin);
            Write(sb, "fpsMax", report.FpsMax);
            Write(sb, "frameMsP50", report.FrameMsP50);
            Write(sb, "frameMsP95", report.FrameMsP95);
            Write(sb, "frameMsP99", report.FrameMsP99);
            Write(sb, "frameMsMax", report.FrameMsMax);
            Write(sb, "secondsBelow30Fps", report.SecondsBelow30Fps);
            Write(sb, "longestBelow30StreakSeconds", report.LongestBelow30StreakSeconds);
            sb.AppendFormat(CultureInfo.InvariantCulture, "  \"memoryBytesStart\": {0},\n", report.MemoryBytesStart);
            sb.AppendFormat(CultureInfo.InvariantCulture, "  \"memoryBytesEnd\": {0},\n", report.MemoryBytesEnd);
            sb.AppendFormat(CultureInfo.InvariantCulture, "  \"activeCreatures\": {0},\n", activeCreatures);
            sb.AppendFormat(CultureInfo.InvariantCulture, "  \"projectConsoleErrors\": {0},\n", errors);
            sb.AppendFormat(CultureInfo.InvariantCulture, "  \"projectConsoleWarnings\": {0}\n", warnings);
            sb.AppendLine("}");
            return sb.ToString();
        }

        static void Write(StringBuilder sb, string key, float value)
        {
            sb.AppendFormat(CultureInfo.InvariantCulture, "  \"{0}\": {1:0.00},\n", key, value);
        }
    }
}
