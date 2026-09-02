using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using VirtualZoo.Presentation;

namespace VirtualZoo.EditorTools
{
    public static class VisualHeroSpikeRunner
    {
        public const string ScenePath = "Assets/VirtualZoo/Scenes/ZooVisualHeroSpike.unity";
        public const string ArtFolder = "Assets/VirtualZoo/Art/VisualHeroSpike";
        public const string DemoScenePath = "Assets/Idyllic Fantasy Nature/Demo/Demo.unity";
        public const string DemoUrpPath = "Assets/Idyllic Fantasy Nature/Demo/Settings/UniversalRenderPipelineAsset.asset";
        public const string DemoRendererPath = "Assets/Idyllic Fantasy Nature/Demo/Settings/UniversalRenderPipelineAsset_Renderer.asset";
        public const string DemoVolumePath = "Assets/Idyllic Fantasy Nature/Demo/Settings/Post-Processing.asset";
        public const string ProjectUrpPath = "Assets/Settings/PC_RPAsset.asset";
        public const string HeroUrpPath = ArtFolder + "/HeroURP.asset";
        public const string HeroRendererPath = ArtFolder + "/HeroURP_Renderer.asset";
        public const string HeroVolumePath = ArtFolder + "/HeroPostProcessing.asset";

        public static void Run()
        {
            string evidence = Path.GetFullPath(Path.Combine(UnityEngine.Application.dataPath, "..", "..", "..", "handoff", "evidence", "visual-hero-spike"));
            Directory.CreateDirectory(evidence);
            var previousDefault = GraphicsSettings.defaultRenderPipeline;
            var previousQuality = QualitySettings.renderPipeline;
            int code = 0;
            try
            {
                ApplyUrp(DemoUrpPath);
                if (!File.Exists(Path.Combine(evidence, "asset-demo-baseline.png")))
                {
                    CaptureDemoBaseline(evidence);
                }
                else
                {
                    Debug.Log("ZOO_VISUAL_HERO_DEMO_SKIP existing baseline");
                }

                VisualHeroSpikeBuilder.Build();
                CaptureHeroVariants(evidence);
                Debug.Log("ZOO_VISUAL_HERO_SPIKE_OK dir=" + evidence);
            }
            catch (Exception exception)
            {
                Debug.LogError(exception);
                code = 3;
            }

            RestorePipeline(previousDefault, previousQuality);
            Finish(code);
        }

        public static void EnsurePipelineCopies()
        {
            if (!AssetDatabase.IsValidFolder("Assets/VirtualZoo/Art"))
            {
                AssetDatabase.CreateFolder("Assets/VirtualZoo", "Art");
            }

            if (!AssetDatabase.IsValidFolder(ArtFolder))
            {
                AssetDatabase.CreateFolder("Assets/VirtualZoo/Art", "VisualHeroSpike");
            }

            CopyFresh(DemoRendererPath, HeroRendererPath);
            CopyFresh(DemoUrpPath, HeroUrpPath);
            CopyFresh(DemoVolumePath, HeroVolumePath);

            var urp = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(HeroUrpPath);
            var renderer = AssetDatabase.LoadAssetAtPath<ScriptableRendererData>(HeroRendererPath);
            if (urp == null || renderer == null)
            {
                throw new InvalidOperationException("Hero URP copies failed.");
            }

            var so = new SerializedObject(urp);
            var list = so.FindProperty("m_RendererDataList");
            if (list != null && list.arraySize > 0)
            {
                list.GetArrayElementAtIndex(0).objectReferenceValue = renderer;
            }

            var msaa = so.FindProperty("m_MSAA");
            if (msaa != null)
            {
                msaa.intValue = 4;
            }

            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(urp);
            AssetDatabase.SaveAssets();
        }

        public static void ApplyUrp(string assetPath)
        {
            var urp = AssetDatabase.LoadAssetAtPath<RenderPipelineAsset>(assetPath);
            if (urp == null)
            {
                throw new InvalidOperationException("Missing URP asset: " + assetPath);
            }

            GraphicsSettings.defaultRenderPipeline = urp;
            QualitySettings.renderPipeline = urp;
        }

        public static void RestorePipeline(RenderPipelineAsset previousDefault, RenderPipelineAsset previousQuality)
        {
            var project = AssetDatabase.LoadAssetAtPath<RenderPipelineAsset>(ProjectUrpPath);
            GraphicsSettings.defaultRenderPipeline = previousDefault != null ? previousDefault : project;
            QualitySettings.renderPipeline = previousQuality != null ? previousQuality : project;
        }

        static void CaptureDemoBaseline(string evidence)
        {
            ApplyUrp(DemoUrpPath);
            var scene = EditorSceneManager.OpenScene(DemoScenePath, OpenSceneMode.Single);
            var camera = CreateCaptureCamera("DemoCaptureCamera");
            FrameDemo(camera);
            Warmup(camera);
            WriteStill(camera, Path.Combine(evidence, "asset-demo-baseline.png"));
            UnityEngine.Object.DestroyImmediate(camera.gameObject);
            Debug.Log("ZOO_VISUAL_HERO_DEMO_OK scene=" + scene.path);
        }

        static void CaptureHeroVariants(string evidence)
        {
            ApplyUrp(DemoUrpPath);
            var camera = Camera.main;
            if (camera == null)
            {
                throw new InvalidOperationException("Hero scene has no Main Camera.");
            }

            VisualHeroSpikeBuilder.ApplyLook(VisualHeroSpikeBuilder.Look.BrightMorning);
            PrepareHeroFrame(camera);
            WriteStill(camera, Path.Combine(evidence, "hero-a-bright-morning.png"));

            VisualHeroSpikeBuilder.ApplyLook(VisualHeroSpikeBuilder.Look.GoldenGarden);
            PrepareHeroFrame(camera);
            WriteStill(camera, Path.Combine(evidence, "hero-b-golden-garden.png"));

            VisualHeroSpikeBuilder.ApplyLook(VisualHeroSpikeBuilder.Look.SoftStorybook);
            PrepareHeroFrame(camera);
            WriteStill(camera, Path.Combine(evidence, "hero-c-soft-storybook.png"));

            VisualHeroSpikeBuilder.ApplyLook(VisualHeroSpikeBuilder.Look.BrightMorning);
            EditorSceneManager.SaveScene(EditorSceneManager.GetActiveScene(), ScenePath);
        }

        static void FrameDemo(Camera camera)
        {
            Renderer lake = FindNamedRenderer("Lake");
            Terrain land = FindLandTerrain();
            var controller = GameObject.Find("Controller");
            Vector3 spawn = controller != null
                ? controller.transform.position + Vector3.up * 1.45f
                : new Vector3(12f, 6.5f, 0f);

            Vector3 focus;
            Vector3 eye;
            if (lake != null)
            {
                Bounds water = lake.bounds;
                focus = water.center + Vector3.up * 0.85f;
                eye = PickDemoShore(water, land, spawn);
            }
            else if (controller != null)
            {
                var fps = controller.GetComponentInChildren<Camera>();
                eye = fps != null ? fps.transform.position : spawn;
                focus = eye + (fps != null ? fps.transform.forward * 18f : Vector3.forward * 18f);
            }
            else
            {
                eye = spawn;
                focus = spawn + Vector3.forward * 16f;
            }

            camera.fieldOfView = 36f;
            camera.nearClipPlane = 0.2f;
            camera.farClipPlane = 420f;
            camera.useOcclusionCulling = false;
            camera.transform.SetPositionAndRotation(eye, Quaternion.LookRotation((focus - eye).normalized, Vector3.up));
            Debug.Log("ZOO_VISUAL_HERO_DEMO_CAM eye=" + eye + " focus=" + focus);
        }

        static Vector3 PickDemoShore(Bounds water, Terrain land, Vector3 spawn)
        {
            Vector3 best = spawn;
            float bestScore = -1f;
            for (int i = 0; i < 16; i++)
            {
                float yaw = i * 22.5f * Mathf.Deg2Rad;
                Vector3 dir = new Vector3(Mathf.Sin(yaw), 0f, Mathf.Cos(yaw));
                float radius = Mathf.Max(water.extents.x, water.extents.z) * 0.62f + 9f;
                Vector3 candidate = water.center + dir * radius;
                candidate.y += 90f;
                Vector3 ground;
                if (!RaycastTop(candidate, out ground))
                {
                    if (land != null)
                    {
                        Vector3 sample = new Vector3(candidate.x, 0f, candidate.z);
                        ground = new Vector3(sample.x, land.SampleHeight(sample) + land.transform.position.y, sample.z);
                    }
                    else
                    {
                        continue;
                    }
                }

                if (ground.y < water.min.y - 1.5f || ground.y > water.max.y + 8f)
                {
                    continue;
                }

                Vector3 eye = ground + Vector3.up * 1.48f;
                if (eye.y < water.center.y + 0.35f)
                {
                    eye.y = water.center.y + 1.35f;
                }

                float towardSpawn = -Vector3.Distance(new Vector3(eye.x, 0f, eye.z), new Vector3(spawn.x, 0f, spawn.z));
                float heightScore = eye.y;
                float score = heightScore * 2f + towardSpawn * 0.02f;
                if (score > bestScore)
                {
                    bestScore = score;
                    best = eye;
                }
            }

            if (bestScore < 0f)
            {
                Vector3 fallback = water.center + Vector3.back * 18f + Vector3.left * 8f;
                fallback.y = water.center.y + 1.6f;
                return fallback;
            }

            return best;
        }

        static bool RaycastTop(Vector3 from, out Vector3 point)
        {
            var hits = Physics.RaycastAll(from, Vector3.down, 240f, ~0, QueryTriggerInteraction.Ignore);
            float bestY = float.NegativeInfinity;
            point = from;
            bool any = false;
            for (int i = 0; i < hits.Length; i++)
            {
                if (hits[i].normal.y < 0.35f)
                {
                    continue;
                }

                if (hits[i].point.y > bestY)
                {
                    bestY = hits[i].point.y;
                    point = hits[i].point;
                    any = true;
                }
            }

            return any;
        }

        static Terrain FindLandTerrain()
        {
            var terrains = Terrain.activeTerrains;
            for (int i = 0; i < terrains.Length; i++)
            {
                if (terrains[i] != null && terrains[i].name.Contains("Land"))
                {
                    return terrains[i];
                }
            }

            return terrains.Length > 0 ? terrains[0] : null;
        }

        static void PrepareHeroFrame(Camera camera)
        {
            camera.fieldOfView = VisualHeroSpikeBuilder.CameraFov;
            camera.aspect = 1920f / 1080f;
            camera.useOcclusionCulling = false;
            camera.transform.SetPositionAndRotation(
                VisualHeroSpikeBuilder.CameraEye,
                Quaternion.LookRotation(
                    (VisualHeroSpikeBuilder.CameraFocus - VisualHeroSpikeBuilder.CameraEye).normalized,
                    Vector3.up));
            Debug.Log("ZOO_VISUAL_HERO_CAM eye=" + camera.transform.position + " fov=" + camera.fieldOfView);
            VisualHeroSpikeBuilder.BillboardCreatures(camera);
            var lake = GameObject.Find("Lake");
            if (lake != null)
            {
                var rend = lake.GetComponent<Renderer>();
                Debug.Log("ZOO_VISUAL_HERO_LAKE pos=" + lake.transform.position + " scale=" + lake.transform.lossyScale + " bounds=" + (rend != null ? rend.bounds.ToString() : "none") + " mat=" + (rend != null && rend.sharedMaterial != null ? rend.sharedMaterial.shader.name : "none"));
            }

            var creatures = UnityEngine.Object.FindObjectsByType<CreaturePresentationV2>(FindObjectsInactive.Exclude, FindObjectsSortMode.None);
            for (int i = 0; i < creatures.Length; i++)
            {
                Vector3 vp = camera.WorldToViewportPoint(creatures[i].transform.position + Vector3.up * 0.4f);
                var mf = creatures[i].GetComponentInChildren<MeshFilter>();
                int verts = mf != null && mf.sharedMesh != null ? mf.sharedMesh.vertexCount : 0;
                Debug.Log("ZOO_VISUAL_HERO_CARD " + creatures[i].name + " vp=" + vp + " verts=" + verts);
            }

            SimulateParticles();
            Warmup(camera);
        }

        public static Camera CreateCaptureCamera(string name)
        {
            var go = new GameObject(name);
            go.tag = "MainCamera";
            var camera = go.AddComponent<Camera>();
            camera.clearFlags = CameraClearFlags.Skybox;
            camera.nearClipPlane = 0.12f;
            camera.farClipPlane = 280f;
            camera.allowHDR = true;
            camera.allowMSAA = true;
            camera.useOcclusionCulling = false;
            var data = go.AddComponent<UniversalAdditionalCameraData>();
            data.renderPostProcessing = true;
            data.renderShadows = true;
            data.antialiasing = AntialiasingMode.SubpixelMorphologicalAntiAliasing;
            data.antialiasingQuality = AntialiasingQuality.High;
            data.requiresColorOption = CameraOverrideOption.On;
            data.requiresDepthOption = CameraOverrideOption.On;
            return camera;
        }

        public static void WriteStill(Camera camera, string path)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            var desc = new RenderTextureDescriptor(1920, 1080, RenderTextureFormat.ARGB32, 24)
            {
                msaaSamples = 4,
                sRGB = QualitySettings.activeColorSpace == ColorSpace.Linear,
                useMipMap = false,
                autoGenerateMips = false
            };
            var rt = RenderTexture.GetTemporary(desc);
            var prevTarget = camera.targetTexture;
            var prevActive = RenderTexture.active;
            camera.targetTexture = rt;
            camera.aspect = 1920f / 1080f;
            camera.Render();
            camera.Render();
            RenderTexture.active = rt;
            var tex = new Texture2D(1920, 1080, TextureFormat.RGB24, false);
            tex.ReadPixels(new Rect(0, 0, 1920, 1080), 0, 0);
            tex.Apply();
            camera.targetTexture = prevTarget;
            RenderTexture.active = prevActive;
            File.WriteAllBytes(path, tex.EncodeToPNG());
            UnityEngine.Object.DestroyImmediate(tex);
            RenderTexture.ReleaseTemporary(rt);
            Debug.Log("ZOO_VISUAL_HERO_STILL " + path);
        }

        public static void Warmup(Camera camera)
        {
            SimulateParticles();
            for (int i = 0; i < 4; i++)
            {
                camera.Render();
            }
        }

        public static void SimulateParticles()
        {
            var systems = UnityEngine.Object.FindObjectsByType<ParticleSystem>(FindObjectsInactive.Include, FindObjectsSortMode.None);
            for (int i = 0; i < systems.Length; i++)
            {
                systems[i].Simulate(3.2f, true, true, false);
            }
        }

        static Renderer FindNamedRenderer(string name)
        {
            var renderers = UnityEngine.Object.FindObjectsByType<Renderer>(FindObjectsInactive.Exclude, FindObjectsSortMode.None);
            Renderer best = null;
            float size = 0f;
            for (int i = 0; i < renderers.Length; i++)
            {
                if (renderers[i] == null || !renderers[i].gameObject.name.Contains(name))
                {
                    continue;
                }

                float volume = renderers[i].bounds.size.sqrMagnitude;
                if (volume > size)
                {
                    size = volume;
                    best = renderers[i];
                }
            }

            return best;
        }

        static Light FindSun()
        {
            var lights = UnityEngine.Object.FindObjectsByType<Light>(FindObjectsInactive.Exclude, FindObjectsSortMode.None);
            for (int i = 0; i < lights.Length; i++)
            {
                if (lights[i].type == LightType.Directional)
                {
                    return lights[i];
                }
            }

            return null;
        }

        static float SampleGround(Vector3 position)
        {
            var terrains = Terrain.activeTerrains;
            float best = position.y;
            for (int i = 0; i < terrains.Length; i++)
            {
                var terrain = terrains[i];
                Vector3 local = position - terrain.transform.position;
                Vector3 size = terrain.terrainData.size;
                if (local.x < 0f || local.z < 0f || local.x > size.x || local.z > size.z)
                {
                    continue;
                }

                best = terrain.SampleHeight(position) + terrain.transform.position.y;
                break;
            }

            return best;
        }

        static void CopyFresh(string source, string dest)
        {
            if (AssetDatabase.LoadAssetAtPath<UnityEngine.Object>(dest) != null)
            {
                AssetDatabase.DeleteAsset(dest);
            }

            if (!AssetDatabase.CopyAsset(source, dest))
            {
                throw new InvalidOperationException("Failed to copy " + source + " -> " + dest);
            }
        }

        static void Finish(int code)
        {
            if (UnityEngine.Application.isBatchMode)
            {
                EditorApplication.Exit(code);
            }
        }
    }
}
