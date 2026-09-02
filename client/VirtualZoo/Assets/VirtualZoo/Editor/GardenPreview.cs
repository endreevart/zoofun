using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using VirtualZoo.Presentation;

namespace VirtualZoo.EditorTools
{
    public static class GardenPreview
    {
        public static readonly string StillPath = Path.GetFullPath(Path.Combine(
            UnityEngine.Application.dataPath,
            "..",
            "..",
            "..",
            "handoff",
            "evidence",
            "visual-hero-spike",
            "garden-hero-live.png"));

        public static void Open()
        {
            EditorSceneManager.OpenScene(IdyllicLayout.ScenePath, OpenSceneMode.Single);
            FrameHero();
            EditorApplication.ExecuteMenuItem("Window/General/Game");
        }

        public static void Play()
        {
            if (EditorSceneManager.GetActiveScene().path != IdyllicLayout.ScenePath)
            {
                Open();
            }

            EditorSettings.enterPlayModeOptionsEnabled = true;
            EditorSettings.enterPlayModeOptions = EnterPlayModeOptions.DisableDomainReload;
            EditorApplication.ExecuteMenuItem("Window/General/Game");
            if (!EditorApplication.isPlaying)
            {
                EditorApplication.isPlaying = true;
            }
        }

        public static string Capture()
        {
            Camera camera = Camera.main;
            if (camera == null)
            {
                var cameras = Object.FindObjectsByType<Camera>(FindObjectsInactive.Exclude, FindObjectsSortMode.None);
                if (cameras.Length > 0)
                {
                    camera = cameras[0];
                }
            }

            if (camera == null)
            {
                throw new InvalidDataException("No camera in ZooIdyllicGarden.");
            }

            var rig = camera.GetComponentInParent<ZooCameraRig>();
            if (rig != null)
            {
                rig.Freeze(true);
                rig.ConfigureCinematic(camera, IdyllicLayout.HeroCamera, IdyllicLayout.HeroFocus, new Vector2(2.6f, 0f));
            }
            else
            {
                FrameHero(camera);
            }

            camera.fieldOfView = IdyllicLayout.CameraFov;
            VisualHeroSpikeRunner.Warmup(camera);
            VisualHeroSpikeRunner.WriteStill(camera, StillPath);
            if (rig != null && EditorApplication.isPlaying)
            {
                rig.Freeze(false);
            }

            Debug.Log("ZOO_GARDEN_PREVIEW " + StillPath);
            return StillPath;
        }

        static void FrameHero()
        {
            var cameras = Object.FindObjectsByType<Camera>(FindObjectsInactive.Include, FindObjectsSortMode.None);
            for (int i = 0; i < cameras.Length; i++)
            {
                cameras[i].enabled = true;
                cameras[i].gameObject.SetActive(true);
                FrameHero(cameras[i]);
            }
        }

        static void FrameHero(Camera camera)
        {
            camera.tag = "MainCamera";
            camera.fieldOfView = IdyllicLayout.CameraFov;
            camera.transform.SetPositionAndRotation(
                IdyllicLayout.HeroCamera,
                Quaternion.LookRotation(
                    (IdyllicLayout.HeroFocus - IdyllicLayout.HeroCamera).normalized,
                    Vector3.up));
        }
    }
}
