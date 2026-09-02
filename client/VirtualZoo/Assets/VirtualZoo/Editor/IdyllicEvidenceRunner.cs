using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace VirtualZoo.EditorTools
{
    public static class IdyllicEvidenceRunner
    {
        enum Phase
        {
            Wait,
            Stills,
            Motion,
            Done
        }

        static bool _playing;
        static float _enteredAt;
        static Phase _phase;
        static int _motionIndex;
        static float _nextMotionAt;
        static string _dir;
        static bool _environmentOnly;
        static bool _stillsOnly;

        public static void CaptureEnvironment()
        {
            _environmentOnly = true;
            Capture();
        }

        public static void CaptureStillsOnly()
        {
            _stillsOnly = true;
            Capture();
        }

        public static void Capture()
        {
            _dir = Path.GetFullPath(Path.Combine(UnityEngine.Application.dataPath, "..", "..", "..", "handoff", "evidence", "iteration-01a-idyllic-cinematic-rework-3"));
            if (_environmentOnly || _stillsOnly)
            {
                _dir = Path.Combine(_dir, "scratch");
            }
            Directory.CreateDirectory(_dir);
            EditorSettings.enterPlayModeOptionsEnabled = true;
            EditorSettings.enterPlayModeOptions = EnterPlayModeOptions.DisableDomainReload;
            EditorSceneManager.OpenScene(ZooIdyllicGardenBuilder.ScenePath);
            _phase = Phase.Wait;
            _motionIndex = 0;
            EditorApplication.playModeStateChanged += OnPlayMode;
            EditorApplication.update += OnUpdate;
            EditorApplication.isPlaying = true;
        }

        static void OnPlayMode(PlayModeStateChange change)
        {
            if (change == PlayModeStateChange.EnteredPlayMode)
            {
                _playing = true;
                _enteredAt = Time.realtimeSinceStartup;
            }
        }

        static void OnUpdate()
        {
            if (!_playing || !EditorApplication.isPlaying)
            {
                return;
            }

            var camera = Camera.main;
            if (camera == null)
            {
                return;
            }

            if (_phase == Phase.Wait && Time.realtimeSinceStartup - _enteredAt >= 2.4f)
            {
                try
                {
                    if (_environmentOnly)
                    {
                        IdyllicEvidenceCapture.CaptureEnvironment(camera, _dir);
                        Debug.Log("ZOO_IDYLLIC_ENV_STILLS_OK");
                        Finish(0);
                        return;
                    }

                    IdyllicEvidenceCapture.CaptureStills(camera, _dir);
                    Debug.Log("ZOO_IDYLLIC_STILLS_OK");
                    if (_stillsOnly)
                    {
                        Finish(0);
                        return;
                    }
                    _phase = Phase.Motion;
                    _nextMotionAt = Time.realtimeSinceStartup;
                    Debug.Log("ZOO_IDYLLIC_STILLS_OK");
                }
                catch (Exception exception)
                {
                    Fail(exception);
                }

                return;
            }

            if (_phase == Phase.Motion && Time.realtimeSinceStartup >= _nextMotionAt)
            {
                try
                {
                    float time = Time.realtimeSinceStartup - _enteredAt;
                    IdyllicEvidenceCapture.CaptureMotionFrame(camera, _dir, _motionIndex + 1, time);
                    _motionIndex++;
                    _nextMotionAt = Time.realtimeSinceStartup + 1.8f;
                    if (_motionIndex >= 8)
                    {
                        _phase = Phase.Done;
                        Debug.Log("ZOO_IDYLLIC_EVIDENCE_CAPTURE_OK frames=" + _motionIndex);
                        Finish(0);
                    }
                }
                catch (Exception exception)
                {
                    Fail(exception);
                }
            }
        }

        static void Fail(Exception exception)
        {
            Debug.LogError(exception);
            Finish(3);
        }

        static void Finish(int code)
        {
            EditorApplication.update -= OnUpdate;
            EditorApplication.playModeStateChanged -= OnPlayMode;
            EditorSettings.enterPlayModeOptionsEnabled = false;
            EditorSettings.enterPlayModeOptions = EnterPlayModeOptions.None;
            EditorApplication.isPlaying = false;
            EditorApplication.Exit(code);
        }
    }
}
