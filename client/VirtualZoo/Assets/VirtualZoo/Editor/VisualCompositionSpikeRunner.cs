using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace VirtualZoo.EditorTools
{
    // Live Editor bridge: UnityLiveBridge.cs (InitializeOnLoad). Hero zone capture.
    public static class VisualCompositionSpikeRunner
    {
        public const string ScenePath = "Assets/VirtualZoo/Scenes/ZooVisualCompositionSpike.unity";
        public const string ArtFolder = "Assets/VirtualZoo/Art/VisualCompositionSpike";
        public const string HeroVolumePath = ArtFolder + "/CompositionPostProcessing.asset";
        public const string SoftLakePath = ArtFolder + "/LakeSoftFoam.mat";

        public static void Run()
        {
            string evidence = Path.GetFullPath(Path.Combine(
                UnityEngine.Application.dataPath, "..", "..", "..", "handoff", "evidence", "visual-hero-spike"));
            Directory.CreateDirectory(evidence);
            var previousDefault = GraphicsSettings.defaultRenderPipeline;
            var previousQuality = QualitySettings.renderPipeline;
            int code = 0;
            try
            {
                VisualHeroSpikeRunner.ApplyUrp(VisualHeroSpikeRunner.DemoUrpPath);
                if (!File.Exists(Path.Combine(evidence, "asset-demo-baseline.png")))
                {
                    throw new FileNotFoundException("Missing asset-demo-baseline.png — capture the demo first.");
                }

                VisualCompositionSpikeBuilder.Build();
                CaptureSets(evidence);
                WriteComparison(evidence);
                Debug.Log("ZOO_VISUAL_COMPOSITION_OK dir=" + evidence);
            }
            catch (Exception exception)
            {
                Debug.LogError(exception);
                code = 3;
            }

            VisualHeroSpikeRunner.RestorePipeline(previousDefault, previousQuality);
            if (!UnityEngine.Application.isBatchMode)
            {
                VisualHeroSpikeRunner.ApplyUrp(VisualHeroSpikeRunner.DemoUrpPath);
            }
            if (UnityEngine.Application.isBatchMode)
            {
                EditorApplication.Exit(code);
            }
            else if (code != 0)
            {
                throw new InvalidOperationException("Visual composition spike failed.");
            }
        }

        public static void EnsureArtFolder()
        {
            if (!AssetDatabase.IsValidFolder("Assets/VirtualZoo/Art"))
            {
                AssetDatabase.CreateFolder("Assets/VirtualZoo", "Art");
            }

            if (!AssetDatabase.IsValidFolder(ArtFolder))
            {
                AssetDatabase.CreateFolder("Assets/VirtualZoo/Art", "VisualCompositionSpike");
            }
        }

        static void CaptureSets(string evidence)
        {
            VisualHeroSpikeRunner.ApplyUrp(VisualHeroSpikeRunner.DemoUrpPath);
            var camera = FindCamera("CamHero");
            if (camera == null)
            {
                throw new InvalidOperationException("Missing camera CamHero");
            }

            var cameras = UnityEngine.Object.FindObjectsByType<Camera>(FindObjectsInactive.Include, FindObjectsSortMode.None);
            for (int i = 0; i < cameras.Length; i++)
            {
                cameras[i].enabled = cameras[i] == camera;
            }

            VisualCompositionSpikeBuilder.HideForegroundBlockers(camera);
            Prepare(camera);
            VisualHeroSpikeRunner.WriteStill(camera, Path.Combine(evidence, "hero-zone-clean.png"));
            VisualCompositionSpikeBuilder.RestoreHidden();
            EditorSceneManager.SaveScene(EditorSceneManager.GetActiveScene(), ScenePath);
        }

        static void WriteComparison(string evidence)
        {
            var files = new[]
            {
                "asset-demo-baseline.png",
                "hero-zone-clean.png"
            };

            var tiles = new Texture2D[2];
            for (int i = 0; i < files.Length; i++)
            {
                byte[] bytes = File.ReadAllBytes(Path.Combine(evidence, files[i]));
                var tex = new Texture2D(2, 2, TextureFormat.RGB24, false);
                if (!tex.LoadImage(bytes, false) || tex.width != 1920 || tex.height != 1080)
                {
                    throw new InvalidOperationException("Comparison tile invalid: " + files[i]);
                }

                tiles[i] = tex;
            }

            var sheet = new Texture2D(3840, 1080, TextureFormat.RGB24, false);
            Blit(sheet, tiles[0], 0, 0);
            Blit(sheet, tiles[1], 1920, 0);
            sheet.Apply();
            File.WriteAllBytes(Path.Combine(evidence, "baseline-hero-comparison.png"), sheet.EncodeToPNG());
            UnityEngine.Object.DestroyImmediate(sheet);
            for (int i = 0; i < tiles.Length; i++)
            {
                UnityEngine.Object.DestroyImmediate(tiles[i]);
            }

            Debug.Log("ZOO_VISUAL_COMPOSITION_COMPARE " + Path.Combine(evidence, "baseline-hero-comparison.png"));
        }

        static void Prepare(Camera camera)
        {
            camera.aspect = 1920f / 1080f;
            camera.useOcclusionCulling = false;
            VisualHeroSpikeRunner.Warmup(camera);
        }

        static Camera FindCamera(string name)
        {
            var cameras = UnityEngine.Object.FindObjectsByType<Camera>(FindObjectsInactive.Include, FindObjectsSortMode.None);
            for (int i = 0; i < cameras.Length; i++)
            {
                if (cameras[i].name == name)
                {
                    cameras[i].enabled = true;
                    cameras[i].gameObject.SetActive(true);
                    return cameras[i];
                }
            }

            return null;
        }

        static void Blit(Texture2D dest, Texture2D src, int x, int y)
        {
            dest.SetPixels(x, y, src.width, src.height, src.GetPixels());
        }
    }
}
