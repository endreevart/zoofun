using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace VirtualZoo.EditorTools
{
    public static class ZooEvidenceRunner
    {
        static bool _waiting;
        static float _enteredAt;

        public static void Capture()
        {
            string evidenceDir = Path.GetFullPath(Path.Combine(UnityEngine.Application.dataPath, "..", "..", "..", "handoff", "evidence", "iteration-01"));
            Directory.CreateDirectory(evidenceDir);
            EditorSettings.enterPlayModeOptionsEnabled = true;
            EditorSettings.enterPlayModeOptions = EnterPlayModeOptions.DisableDomainReload;
            EditorSceneManager.OpenScene(ZooSceneBuilder.ScenePath);
            EditorApplication.playModeStateChanged += OnPlayMode;
            EditorApplication.update += OnUpdate;
            EditorApplication.isPlaying = true;
        }

        static void OnPlayMode(PlayModeStateChange change)
        {
            if (change == PlayModeStateChange.EnteredPlayMode)
            {
                _waiting = true;
                _enteredAt = Time.realtimeSinceStartup;
            }
        }

        static void OnUpdate()
        {
            if (!_waiting || !EditorApplication.isPlaying)
            {
                return;
            }

            if (Time.realtimeSinceStartup - _enteredAt < 1.6f)
            {
                return;
            }

            _waiting = false;
            EditorApplication.update -= OnUpdate;
            EditorApplication.playModeStateChanged -= OnPlayMode;
            try
            {
                var camera = Camera.main;
                string evidenceDir = Path.GetFullPath(Path.Combine(UnityEngine.Application.dataPath, "..", "..", "..", "handoff", "evidence", "iteration-01"));
                float started = Time.realtimeSinceStartup;
                EvidenceCapture.CaptureVerified(camera, evidenceDir);
                float hitchMs = (Time.realtimeSinceStartup - started) * 1000f;
                File.WriteAllText(
                    Path.Combine(evidenceDir, "evidence-hitch.json"),
                    "{\n  \"capturePerformed\": true,\n  \"captureHitchMs\": " +
                    hitchMs.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture) +
                    "\n}\n");
                Debug.Log("ZOO_EVIDENCE_CAPTURE_OK hitchMs=" + hitchMs.ToString("0.00"));
                EditorSettings.enterPlayModeOptionsEnabled = false;
                EditorSettings.enterPlayModeOptions = EnterPlayModeOptions.None;
                EditorApplication.isPlaying = false;
                EditorApplication.Exit(0);
            }
            catch (Exception exception)
            {
                Debug.LogError(exception);
                EditorSettings.enterPlayModeOptionsEnabled = false;
                EditorSettings.enterPlayModeOptions = EnterPlayModeOptions.None;
                EditorApplication.isPlaying = false;
                EditorApplication.Exit(3);
            }
        }
    }
}
