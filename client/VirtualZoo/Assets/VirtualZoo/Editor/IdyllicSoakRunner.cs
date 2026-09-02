using System;
using System.Globalization;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using VirtualZoo.Presentation;

namespace VirtualZoo.EditorTools
{
    public static class IdyllicSoakRunner
    {
        const float DefaultSeconds = 300f;
        static float _duration;
        static bool _playing;
        static bool _started;
        static bool _exited;
        static int _exitCode;
        static DateTime _launchUtc;
        static ZooSoakCollector _collector;

        public static void Run()
        {
            if (_started)
            {
                return;
            }

            _started = true;
            _launchUtc = DateTime.UtcNow;
            EditorSettings.enterPlayModeOptionsEnabled = true;
            EditorSettings.enterPlayModeOptions = EnterPlayModeOptions.DisableDomainReload;
            _duration = DefaultSeconds;
            string env = Environment.GetEnvironmentVariable("ZOO_SOAK_SECONDS");
            if (!string.IsNullOrEmpty(env) && float.TryParse(env, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed))
            {
                _duration = parsed;
            }

            Directory.CreateDirectory(EvidenceDir());
            File.WriteAllText(
                Path.Combine(EvidenceDir(), "soak-started.txt"),
                "duration=" + _duration.ToString("0.00", CultureInfo.InvariantCulture) + "\n" +
                "utc=" + _launchUtc.ToString("o", CultureInfo.InvariantCulture) + "\n" +
                "mode=performance\n" +
                "capture=false\n");
            Debug.Log("IdyllicSoakRunner starting performance soak, duration=" + _duration);
            EditorSceneManager.OpenScene(ZooIdyllicGardenBuilder.ScenePath);
            EditorApplication.playModeStateChanged += OnPlayMode;
            EditorApplication.update += OnUpdate;
            EditorApplication.isPlaying = true;
        }

        static void OnPlayMode(PlayModeStateChange change)
        {
            if (change == PlayModeStateChange.EnteredPlayMode)
            {
                _playing = true;
                var rig = UnityEngine.Object.FindFirstObjectByType<ZooCameraRig>();
                var director = UnityEngine.Object.FindFirstObjectByType<ZooDirector>();
                _collector = UnityEngine.Object.FindFirstObjectByType<ZooSoakCollector>();
                if (_collector == null)
                {
                    var go = new GameObject("ZooSoakCollector");
                    _collector = go.AddComponent<ZooSoakCollector>();
                }

                _collector.Configure(_duration, rig, director);
                Debug.Log("IdyllicSoakRunner entered play mode. capturePerformed=false");
            }

            if (change == PlayModeStateChange.EnteredEditMode && _playing)
            {
                Finish(_exitCode);
            }
        }

        static void OnUpdate()
        {
            if (!_playing)
            {
                if ((DateTime.UtcNow - _launchUtc).TotalSeconds > 120)
                {
                    Debug.LogError("IdyllicSoakRunner watchdog: play mode did not start within 120s.");
                    Finish(2);
                }

                return;
            }

            if (!EditorApplication.isPlaying || _collector == null)
            {
                return;
            }

            if (Time.frameCount % 300 == 0)
            {
                File.WriteAllText(
                    Path.Combine(EvidenceDir(), "soak-heartbeat.txt"),
                    "elapsed=" + _collector.ElapsedSeconds.ToString("0.00", CultureInfo.InvariantCulture) +
                    " complete=" + _collector.IsComplete +
                    " creatures=" + _collector.ActiveCreatures +
                    "\n");
            }

            if (_collector.IsComplete)
            {
                var report = _collector.Report;
                if (report.SampleCount > report.TotalGameplayFrames ||
                    report.SecondsBelow30Fps < 0f ||
                    report.SecondsBelow30Fps > report.SoakSeconds ||
                    report.LongestBelow30StreakSeconds >= 1f ||
                    _collector.ActiveCreatures != 20 ||
                    _collector.ProjectErrors != 0 ||
                    _collector.ProjectWarnings != 0)
                {
                    Debug.LogError(
                        "IdyllicSoakRunner invariant failed samples=" + report.SampleCount +
                        " frames=" + report.TotalGameplayFrames +
                        " below30=" + report.SecondsBelow30Fps +
                        " streak=" + report.LongestBelow30StreakSeconds +
                        " creatures=" + _collector.ActiveCreatures +
                        " errors=" + _collector.ProjectErrors +
                        " warnings=" + _collector.ProjectWarnings);
                    WriteMetrics();
                    _exitCode = 4;
                    EditorApplication.isPlaying = false;
                    return;
                }

                WriteMetrics();
                _exitCode = 0;
                EditorApplication.isPlaying = false;
            }
        }

        static void WriteMetrics()
        {
            var json = ZooSoakCollector.FormatReport(
                _collector.Report,
                _collector.ActiveCreatures,
                _collector.ProjectErrors,
                _collector.ProjectWarnings);
            File.WriteAllText(Path.Combine(EvidenceDir(), "soak-metrics.json"), json);
            File.WriteAllText(Path.Combine(EvidenceDir(), "console-soak.log"), _collector.ConsoleText);
        }

        static void Finish(int code)
        {
            if (_exited)
            {
                return;
            }

            _exited = true;
            EditorApplication.update -= OnUpdate;
            EditorApplication.playModeStateChanged -= OnPlayMode;
            EditorSettings.enterPlayModeOptionsEnabled = false;
            EditorSettings.enterPlayModeOptions = EnterPlayModeOptions.None;
            EditorApplication.Exit(code);
        }

        static string EvidenceDir()
        {
            return Path.GetFullPath(Path.Combine(UnityEngine.Application.dataPath, "..", "..", "..", "handoff", "evidence", "iteration-01a-idyllic-cinematic-rework-3"));
        }
    }
}
