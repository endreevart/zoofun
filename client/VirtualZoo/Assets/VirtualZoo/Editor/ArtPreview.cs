using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using VirtualZoo.Presentation;

namespace VirtualZoo.EditorTools
{
    public static class ArtPreview
    {
        public static readonly string StillPath = Path.GetFullPath(Path.Combine(
            UnityEngine.Application.dataPath,
            "..",
            "..",
            "..",
            "handoff",
            "evidence",
            "visual-hero-spike",
            "cartoon-garden-live.png"));

        public static void Open()
        {
            EditorSceneManager.OpenScene(ZooArtDirectionBuilder.ScenePath, OpenSceneMode.Single);
            FrameHero();
            EditorApplication.ExecuteMenuItem("Window/General/Game");
        }

        public static string Capture()
        {
            if (EditorSceneManager.GetActiveScene().path != ZooArtDirectionBuilder.ScenePath)
            {
                Open();
            }

            HideCreatures();
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
                throw new InvalidDataException("No camera in ZooArtDirection.");
            }

            var rig = camera.GetComponentInParent<ArtCameraRig>();
            if (rig != null)
            {
                rig.Freeze(true);
                rig.Configure(camera, ArtLayout.HeroCamera, ArtLayout.HeroFocus);
            }

            FrameHero(camera);
            BakeProbes();
            VisualHeroSpikeRunner.Warmup(camera);
            VisualHeroSpikeRunner.WriteStill(camera, StillPath);
            Debug.Log("ZOO_ART_PREVIEW " + StillPath);
            return StillPath;
        }

        static void HideCreatures()
        {
            var root = GameObject.Find("Creatures");
            if (root != null)
            {
                root.SetActive(false);
            }
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
            camera.fieldOfView = ArtLayout.HeroFov;
            camera.transform.SetPositionAndRotation(
                ArtLayout.HeroCamera,
                Quaternion.LookRotation(
                    (ArtLayout.HeroFocus - ArtLayout.HeroCamera).normalized,
                    Vector3.up));
        }

        static void BakeProbes()
        {
            var probes = Object.FindObjectsByType<ReflectionProbe>(FindObjectsInactive.Exclude, FindObjectsSortMode.None);
            for (int i = 0; i < probes.Length; i++)
            {
                probes[i].RenderProbe();
            }
        }
    }
}
