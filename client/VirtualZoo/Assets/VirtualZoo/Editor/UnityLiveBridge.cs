using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using VirtualZoo.Presentation;

namespace VirtualZoo.EditorTools
{
    [InitializeOnLoad]
    public static class UnityLiveBridge
    {
        public const string CommandPath = "/tmp/zoofun-unity.cmd";
        public const string ReplyPath = "/tmp/zoofun-unity.reply";

        static double _lastCheck;
        static bool _busy;

        static UnityLiveBridge()
        {
            EditorApplication.update += Tick;
            Debug.Log("ZOO_UNITY_BRIDGE_READY project=" + UnityEngine.Application.dataPath);
        }

        static void Tick()
        {
            if (_busy || EditorApplication.isCompiling || EditorApplication.isUpdating)
            {
                return;
            }

            if (EditorApplication.timeSinceStartup - _lastCheck < 0.4d)
            {
                return;
            }

            _lastCheck = EditorApplication.timeSinceStartup;
            if (!File.Exists(CommandPath))
            {
                return;
            }

            string command;
            try
            {
                command = File.ReadAllText(CommandPath).Trim();
                File.Delete(CommandPath);
            }
            catch
            {
                return;
            }

            if (string.IsNullOrEmpty(command))
            {
                return;
            }

            _busy = true;
            try
            {
                Handle(command);
            }
            catch (Exception exception)
            {
                Reply("ERR " + exception.Message);
                Debug.LogError(exception);
            }
            finally
            {
                _busy = false;
            }
        }

        static void Handle(string command)
        {
            Debug.Log("ZOO_UNITY_BRIDGE_CMD " + command);
            if (command == "ping")
            {
                string scene = EditorSceneManager.GetActiveScene().path;
                Reply("PONG scene=" + scene + " playing=" + EditorApplication.isPlaying);
                return;
            }

            if (command == "open-composition")
            {
                var scene = EditorSceneManager.OpenScene(VisualCompositionSpikeRunner.ScenePath, OpenSceneMode.Single);
                ActivateCamera("CamHero");
                EditorApplication.ExecuteMenuItem("Window/General/Game");
                Reply("OPENED " + scene.path + " camera=CamHero");
                return;
            }

            if (command == "camera-a" || command == "camera-hero")
            {
                ActivateCamera("CamHero");
                Reply("CAMERA CamHero");
                return;
            }

            if (command == "camera-b")
            {
                ActivateCamera("CamHero");
                Reply("CAMERA CamHero");
                return;
            }

            if (command == "camera-c")
            {
                ActivateCamera("CamHero");
                Reply("CAMERA CamHero");
                return;
            }

            if (command == "build-composition")
            {
                VisualCompositionSpikeBuilder.Build();
                ActivateCamera("CamHero");
                Reply("BUILT " + VisualCompositionSpikeRunner.ScenePath);
                return;
            }

            if (command == "capture-composition")
            {
                VisualCompositionSpikeRunner.Run();
                Reply("CAPTURED");
                return;
            }

            if (command == "open-garden")
            {
                GardenPreview.Open();
                Reply("OPENED " + IdyllicLayout.ScenePath);
                return;
            }

            if (command == "play-garden")
            {
                GardenPreview.Play();
                Reply("PLAYING " + IdyllicLayout.ScenePath);
                return;
            }

            if (command == "capture-garden")
            {
                string path = GardenPreview.Capture();
                Reply("CAPTURED " + path);
                return;
            }

            if (command == "stop-play")
            {
                if (EditorApplication.isPlaying)
                {
                    EditorApplication.isPlaying = false;
                }

                Reply("STOPPED");
                return;
            }

            if (command == "build-art")
            {
                if (EditorApplication.isPlaying)
                {
                    EditorApplication.isPlaying = false;
                }

                ZooArtDirectionBuilder.Build();
                EditorApplication.ExecuteMenuItem("Window/General/Game");
                Reply("BUILT " + ZooArtDirectionBuilder.ScenePath);
                return;
            }

            if (command == "open-art")
            {
                ArtPreview.Open();
                Reply("OPENED " + ZooArtDirectionBuilder.ScenePath);
                return;
            }

            if (command == "capture-art")
            {
                string path = ArtPreview.Capture();
                Reply("CAPTURED " + path);
                return;
            }

            Reply("UNKNOWN " + command);
        }

        static void ActivateCamera(string name)
        {
            var cameras = UnityEngine.Object.FindObjectsByType<Camera>(FindObjectsInactive.Include, FindObjectsSortMode.None);
            Camera chosen = null;
            for (int i = 0; i < cameras.Length; i++)
            {
                bool match = cameras[i].name == name;
                cameras[i].enabled = match;
                cameras[i].gameObject.SetActive(true);
                if (match)
                {
                    chosen = cameras[i];
                }
            }

            if (chosen == null)
            {
                throw new InvalidOperationException("Missing camera " + name);
            }

            chosen.tag = "MainCamera";
            Selection.activeGameObject = chosen.gameObject;
            SceneView.FrameLastActiveSceneView();
        }

        static void Reply(string text)
        {
            File.WriteAllText(ReplyPath, text + "\n");
            Debug.Log("ZOO_UNITY_BRIDGE_REPLY " + text);
        }
    }
}
