using UnityEngine;
using UnityEngine.Rendering;

namespace VirtualZoo.Presentation
{
    public static class MobileQuality
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void ApplyAfterLoad()
        {
            if (!UnityEngine.Application.isPlaying)
            {
                return;
            }

            QuietReflectionProbes();
            if (!IsHandheld())
            {
                return;
            }

            UnityEngine.Application.targetFrameRate = 60;
            QualitySettings.vSyncCount = 0;
            QualitySettings.shadowDistance = 20f;
            QualitySettings.lodBias = 0.75f;
            QualitySettings.particleRaycastBudget = 32;
            ShrinkTerrains();
            TightenCameras();
        }

        public static bool IsHandheld()
        {
            return UnityEngine.Application.isMobilePlatform;
        }

        static void QuietReflectionProbes()
        {
            var probes = Object.FindObjectsByType<ReflectionProbe>(FindObjectsInactive.Exclude, FindObjectsSortMode.None);
            for (int i = 0; i < probes.Length; i++)
            {
                if (probes[i] == null)
                {
                    continue;
                }

                probes[i].refreshMode = ReflectionProbeRefreshMode.OnAwake;
            }
        }

        static void ShrinkTerrains()
        {
            var terrains = Terrain.activeTerrains;
            for (int i = 0; i < terrains.Length; i++)
            {
                Terrain terrain = terrains[i];
                if (terrain == null)
                {
                    continue;
                }

                terrain.detailObjectDistance = 22f;
                terrain.treeDistance = 70f;
                terrain.heightmapPixelError = 8f;
                terrain.treeBillboardDistance = 18f;
            }
        }

        static void TightenCameras()
        {
            var cameras = Object.FindObjectsByType<Camera>(FindObjectsInactive.Exclude, FindObjectsSortMode.None);
            for (int i = 0; i < cameras.Length; i++)
            {
                Camera camera = cameras[i];
                if (camera == null)
                {
                    continue;
                }

                camera.allowHDR = false;
                camera.farClipPlane = Mathf.Min(camera.farClipPlane, 48f);
                var extra = camera.GetComponent<UnityEngine.Rendering.Universal.UniversalAdditionalCameraData>();
                if (extra != null)
                {
                    extra.requiresColorTexture = false;
                }
            }
        }
    }
}
