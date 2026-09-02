using System;
using System.Globalization;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using VirtualZoo.Presentation;

namespace VirtualZoo.EditorTools
{
    public static class ArtDirectionFpsRunner
    {
        const float DefaultSeconds = 60f;
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
            string env = Environment.GetEnvironmentVariable("ZOO_ART_FPS_SECONDS");
            if (!string.IsNullOrEmpty(env) && float.TryParse(env, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed))
            {
                _duration = parsed;
            }

            Directory.CreateDirectory(EvidenceDir());
            EditorSceneManager.OpenScene(ZooArtDirectionBuilder.ScenePath);
            EditorApplication.playModeStateChanged += OnPlayMode;
            EditorApplication.update += OnUpdate;
            EditorApplication.isPlaying = true;
        }

        static void OnPlayMode(PlayModeStateChange change)
        {
            if (change == PlayModeStateChange.EnteredPlayMode)
            {
                _playing = true;
                var rig = UnityEngine.Object.FindFirstObjectByType<ArtCameraRig>();
                var director = UnityEngine.Object.FindFirstObjectByType<ArtDirectionDirector>();
                _collector = UnityEngine.Object.FindFirstObjectByType<ZooSoakCollector>();
                if (_collector == null)
                {
                    var go = new GameObject("ZooSoakCollector");
                    _collector = go.AddComponent<ZooSoakCollector>();
                }

                _collector.ConfigureArt(_duration, rig, director);
                Debug.Log("ArtDirectionFpsRunner entered play mode.");
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
                if ((DateTime.UtcNow - _launchUtc).TotalSeconds > 90)
                {
                    Debug.LogError("ArtDirectionFpsRunner watchdog: play mode did not start.");
                    Finish(2);
                }

                return;
            }

            if (!EditorApplication.isPlaying || _collector == null)
            {
                return;
            }

            if (_collector.IsComplete)
            {
                var report = _collector.Report;
                WriteMetrics();
                if (report.SampleCount <= 0 ||
                    _collector.ActiveCreatures < 6 ||
                    _collector.ActiveCreatures > 8 ||
                    _collector.ProjectErrors != 0)
                {
                    Debug.LogError(
                        "ArtDirectionFpsRunner failed samples=" + report.SampleCount +
                        " fps=" + report.FpsAverage +
                        " creatures=" + _collector.ActiveCreatures +
                        " errors=" + _collector.ProjectErrors);
                    _exitCode = 4;
                    EditorApplication.isPlaying = false;
                    return;
                }

                Debug.Log(
                    "ZOO_ART_FPS_OK fpsAverage=" + report.FpsAverage.ToString("0.00", CultureInfo.InvariantCulture) +
                    " creatures=" + _collector.ActiveCreatures +
                    " errors=" + _collector.ProjectErrors);
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
            File.WriteAllText(Path.Combine(EvidenceDir(), "fps-60s.json"), json);
            File.WriteAllText(Path.Combine(EvidenceDir(), "console-fps.log"), _collector.ConsoleText);
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
            return Path.GetFullPath(Path.Combine(UnityEngine.Application.dataPath, "..", "..", "..", "handoff", "evidence", "iteration-01a"));
        }
    }
}
