using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.AI;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using VirtualZoo.Application;
using VirtualZoo.Domain;
using VirtualZoo.Infrastructure;
using VirtualZoo.Presentation;

namespace VirtualZoo.EditorTools
{
    public static class VisualHeroSpikeBuilder
    {
        public enum Look
        {
            BrightMorning,
            GoldenGarden,
            SoftStorybook
        }

        public const float CameraFov = 34f;
        public static Vector3 CameraEye = new Vector3(133.1f, 19.9f, 143f);
        public static Vector3 CameraFocus = new Vector3(133.1f, 16.6f, 168.7f);
        public static Vector3 PondCenter = new Vector3(133.1f, 16.6f, 168.7f);
        public const float WaterY = 16.5f;
        public const string ScenePath = VisualHeroSpikeRunner.ScenePath;

        public static void Build()
        {
            VisualHeroSpikeRunner.EnsurePipelineCopies();
            VisualHeroSpikeRunner.ApplyUrp(VisualHeroSpikeRunner.DemoUrpPath);

            var demo = EditorSceneManager.OpenScene(VisualHeroSpikeRunner.DemoScenePath, OpenSceneMode.Single);
            var lighting = CaptureLighting();
            var hero = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Additive);
            EditorSceneManager.SetActiveScene(hero);

            var roots = demo.GetRootGameObjects();
            for (int i = 0; i < roots.Length; i++)
            {
                if (roots[i].name == "Controls")
                {
                    continue;
                }

                var copy = Object.Instantiate(roots[i]);
                copy.name = roots[i].name;
                EditorSceneManager.MoveGameObjectToScene(copy, hero);
            }

            EditorSceneManager.CloseScene(demo, true);
            RestoreLighting(lighting);
            StripBorrowedCameras();
            BindHeroPipeline();

            var fauna = new GameObject("Creatures");
            var camera = BuildCamera();
            FrameHeroView(camera);
            SpawnCreatures(fauna.transform, camera);
            ApplyLook(Look.BrightMorning);

            EditorSceneManager.SaveScene(hero, ScenePath);
            AssetDatabase.SaveAssets();
        }

        public static void ApplyLook(Look look)
        {
            var sun = GameObject.Find("HeroSun");
            var light = sun != null ? sun.GetComponent<Light>() : null;
            var volume = GameObject.Find("HeroVolume");
            var profile = volume != null ? volume.GetComponent<Volume>() : null;
            if (light == null || profile == null)
            {
                return;
            }

            VolumeProfile shared = profile.sharedProfile;
            if (shared == null)
            {
                return;
            }

            if (look == Look.BrightMorning)
            {
                sun.transform.rotation = Quaternion.Euler(37f, -46f, 0f);
                light.color = Hex("FFF1C8");
                light.intensity = 1.05f;
                light.shadowStrength = 0.78f;
                RenderSettings.fogColor = new Color(0.72f, 0.94f, 0.92f, 1f);
                RenderSettings.fogDensity = 0.0032f;
                RenderSettings.ambientIntensity = 0.95f;
                SetGrade(shared, 0.00f, 12f, 4f, 8f, 0.55f, 0.92f, 0.16f);
                ScaleGodRays(1f, new Color(1f, 0.94f, 0.78f, 0.22f));
            }
            else if (look == Look.GoldenGarden)
            {
                sun.transform.rotation = Quaternion.Euler(26f, -54f, 0f);
                light.color = Hex("FFC889");
                light.intensity = 1.32f;
                light.shadowStrength = 0.84f;
                RenderSettings.fogColor = new Color(0.86f, 0.78f, 0.52f, 1f);
                RenderSettings.fogDensity = 0.0058f;
                RenderSettings.ambientIntensity = 0.88f;
                SetGrade(shared, 0.04f, 16f, 8f, 28f, 0.88f, 0.82f, 0.2f);
                ScaleGodRays(1.45f, new Color(1f, 0.78f, 0.42f, 0.38f));
            }
            else
            {
                sun.transform.rotation = Quaternion.Euler(44f, -38f, 0f);
                light.color = Hex("FFE6C4");
                light.intensity = 0.94f;
                light.shadowStrength = 0.5f;
                RenderSettings.fogColor = new Color(0.9f, 0.86f, 0.78f, 1f);
                RenderSettings.fogDensity = 0.0075f;
                RenderSettings.ambientIntensity = 1.06f;
                SetGrade(shared, 0.18f, 2f, -4f, 10f, 0.28f, 1.05f, 0.1f);
                ScaleGodRays(0.7f, new Color(1f, 0.92f, 0.82f, 0.12f));
            }

            RenderSettings.sun = light;
        }

        public static void BillboardCreatures(Camera camera)
        {
            var cards = Object.FindObjectsByType<CreaturePresentationV2>(FindObjectsInactive.Exclude, FindObjectsSortMode.None);
            for (int i = 0; i < cards.Length; i++)
            {
                cards[i].BillboardNow();
            }

            var motors = Object.FindObjectsByType<CreatureMotor>(FindObjectsInactive.Include, FindObjectsSortMode.None);
            for (int i = 0; i < motors.Length; i++)
            {
                motors[i].enabled = false;
            }

            var spacing = Object.FindObjectsByType<CreatureSpacing>(FindObjectsInactive.Include, FindObjectsSortMode.None);
            for (int i = 0; i < spacing.Length; i++)
            {
                spacing[i].enabled = false;
            }

            var agents = Object.FindObjectsByType<NavMeshAgent>(FindObjectsInactive.Include, FindObjectsSortMode.None);
            for (int i = 0; i < agents.Length; i++)
            {
                agents[i].enabled = false;
            }
        }

        struct LightingCache
        {
            public Material Skybox;
            public AmbientMode AmbientMode;
            public float AmbientIntensity;
            public bool Fog;
            public FogMode FogMode;
            public Color FogColor;
            public float FogDensity;
            public float FogStart;
            public float FogEnd;
            public DefaultReflectionMode ReflectionMode;
            public float ReflectionIntensity;
            public Color SubtractiveShadow;
        }

        static LightingCache CaptureLighting()
        {
            return new LightingCache
            {
                Skybox = RenderSettings.skybox,
                AmbientMode = RenderSettings.ambientMode,
                AmbientIntensity = RenderSettings.ambientIntensity,
                Fog = RenderSettings.fog,
                FogMode = RenderSettings.fogMode,
                FogColor = RenderSettings.fogColor,
                FogDensity = RenderSettings.fogDensity,
                FogStart = RenderSettings.fogStartDistance,
                FogEnd = RenderSettings.fogEndDistance,
                ReflectionMode = RenderSettings.defaultReflectionMode,
                ReflectionIntensity = RenderSettings.reflectionIntensity,
                SubtractiveShadow = RenderSettings.subtractiveShadowColor
            };
        }

        static void RestoreLighting(LightingCache lighting)
        {
            RenderSettings.skybox = lighting.Skybox;
            RenderSettings.ambientMode = lighting.AmbientMode;
            RenderSettings.ambientIntensity = lighting.AmbientIntensity;
            RenderSettings.fog = lighting.Fog;
            RenderSettings.fogMode = lighting.FogMode;
            RenderSettings.fogColor = lighting.FogColor;
            RenderSettings.fogDensity = lighting.FogDensity;
            RenderSettings.fogStartDistance = lighting.FogStart;
            RenderSettings.fogEndDistance = lighting.FogEnd;
            RenderSettings.defaultReflectionMode = lighting.ReflectionMode;
            RenderSettings.reflectionIntensity = lighting.ReflectionIntensity;
            RenderSettings.subtractiveShadowColor = lighting.SubtractiveShadow;
        }

        static void StripBorrowedCameras()
        {
            var cameras = Object.FindObjectsByType<Camera>(FindObjectsInactive.Include, FindObjectsSortMode.None);
            for (int i = 0; i < cameras.Length; i++)
            {
                Object.DestroyImmediate(cameras[i]);
            }

            var listeners = Object.FindObjectsByType<AudioListener>(FindObjectsInactive.Include, FindObjectsSortMode.None);
            for (int i = 0; i < listeners.Length; i++)
            {
                Object.DestroyImmediate(listeners[i]);
            }
        }

        static void BindHeroPipeline()
        {
            var sun = GameObject.Find("Directional Light");
            if (sun != null)
            {
                sun.name = "HeroSun";
            }

            var volumeGo = GameObject.Find("PostProcessing");
            if (volumeGo == null)
            {
                volumeGo = new GameObject("HeroVolume");
                volumeGo.AddComponent<Volume>();
            }

            volumeGo.name = "HeroVolume";
            var volume = volumeGo.GetComponent<Volume>();
            if (volume == null)
            {
                volume = volumeGo.AddComponent<Volume>();
            }

            volume.isGlobal = true;
            volume.priority = 1f;
            volume.sharedProfile = AssetDatabase.LoadAssetAtPath<VolumeProfile>(VisualHeroSpikeRunner.HeroVolumePath);
        }

        static Camera BuildCamera()
        {
            var camera = VisualHeroSpikeRunner.CreateCaptureCamera("Main Camera");
            camera.tag = "MainCamera";
            camera.fieldOfView = CameraFov;
            camera.nearClipPlane = 0.2f;
            camera.farClipPlane = 420f;
            camera.gameObject.AddComponent<AudioListener>();
            return camera;
        }

        static void FrameHeroView(Camera camera)
        {
            var lake = FindNamedRenderer("Lake");
            var land = FindLandTerrain();
            if (lake == null)
            {
                throw new FileNotFoundException("Cloned demo has no Lake.");
            }

            Bounds water = lake.bounds;
            PondCenter = water.center;
            CameraFocus = water.center + Vector3.up * 0.45f;
            Physics.SyncTransforms();
            CameraEye = PickShore(water, land);
            camera.fieldOfView = CameraFov;
            camera.useOcclusionCulling = false;
            camera.transform.SetPositionAndRotation(
                CameraEye,
                Quaternion.LookRotation((CameraFocus - CameraEye).normalized, Vector3.up));
            Debug.Log("ZOO_VISUAL_HERO_FRAME eye=" + CameraEye + " focus=" + CameraFocus + " water=" + water);
        }

        static Vector3 PickShore(Bounds water, Terrain land)
        {
            Vector3 preferred = new Vector3(water.center.x, water.center.y + 1.5f, water.center.z - 18f);
            Vector3 best = preferred;
            float bestScore = float.NegativeInfinity;
            for (int i = 0; i < 24; i++)
            {
                float yaw = i * 15f * Mathf.Deg2Rad;
                Vector3 dir = new Vector3(Mathf.Sin(yaw), 0f, Mathf.Cos(yaw));
                float radius = Mathf.Max(water.extents.x, water.extents.z) * 0.58f + 7.5f;
                Vector3 candidate = water.center + dir * radius;
                candidate.y += 80f;
                Vector3 ground;
                if (!RaycastTop(candidate, out ground))
                {
                    if (land == null)
                    {
                        continue;
                    }

                    Vector3 sample = new Vector3(candidate.x, 0f, candidate.z);
                    ground = new Vector3(sample.x, land.SampleHeight(sample) + land.transform.position.y, sample.z);
                }

                if (ground.y < water.min.y - 1.2f || ground.y > water.max.y + 9f)
                {
                    continue;
                }

                Vector3 eye = ground + Vector3.up * 1.46f;
                if (eye.y < water.center.y + 0.4f)
                {
                    eye.y = water.center.y + 1.35f;
                }

                Vector3 toWater = water.center - eye;
                float openness = Vector3.Dot(toWater.normalized, Vector3.forward);
                float score = eye.y * 1.4f + openness * 6f - Mathf.Abs(toWater.magnitude - 16f);
                if (score > bestScore)
                {
                    bestScore = score;
                    best = eye;
                }
            }

            return best;
        }

        static bool RaycastTop(Vector3 from, out Vector3 point)
        {
            var hits = Physics.RaycastAll(from, Vector3.down, 240f, ~0, QueryTriggerInteraction.Ignore);
            float bestY = float.NegativeInfinity;
            point = Vector3.zero;
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

        static Renderer FindNamedRenderer(string name)
        {
            var renderers = Object.FindObjectsByType<Renderer>(FindObjectsInactive.Exclude, FindObjectsSortMode.None);
            for (int i = 0; i < renderers.Length; i++)
            {
                if (renderers[i].name == name)
                {
                    return renderers[i];
                }
            }

            return null;
        }

        static void SpawnCreatures(Transform parent, Camera camera)
        {
            var assets = AssetDatabase.LoadAssetAtPath<ArtDirectionAssets>("Assets/VirtualZoo/Art/Creatures/Fixtures/ArtDirectionAssets.asset");
            if (assets == null)
            {
                throw new FileNotFoundException("ArtDirectionAssets missing.");
            }

            var factory = new CreatureFactoryV2(camera, assets.CreatureSlab, assets.CreatureNub, assets.CardShader, PondCenter.y + 0.04f);
            var catalog = new FileFixtureCatalog(FileFixtureCatalog.BundledRoot);
            var fixtures = catalog.LoadValidFixtures();
            var wp = new GameObject("HeroWaypoint");
            wp.transform.SetParent(parent, false);
            var points = new[] { wp.transform };

            Vector3 rabbit;
            Vector3 pig;
            Vector3 cat;
            Vector3 dog;
            Vector3 duck;
            if (!PlaceOnView(camera, new Vector3(0.30f, 0.22f), 5.5f, 16f, out rabbit))
            {
                rabbit = CameraEye + camera.transform.forward * 8f + camera.transform.right * -1.4f;
            }

            if (!PlaceOnView(camera, new Vector3(0.62f, 0.22f), 5.5f, 16f, out pig))
            {
                pig = CameraEye + camera.transform.forward * 8.4f + camera.transform.right * 1.3f;
            }

            if (!PlaceOnView(camera, new Vector3(0.44f, 0.32f), 6f, 16f, out cat))
            {
                cat = CameraEye + camera.transform.forward * 9.6f + camera.transform.right * -0.3f;
            }

            if (!PlaceOnView(camera, new Vector3(0.70f, 0.32f), 6f, 16f, out dog))
            {
                dog = CameraEye + camera.transform.forward * 10.2f + camera.transform.right * 1.6f;
            }

            if (!PlaceOnView(camera, new Vector3(0.50f, 0.42f), 8f, 22f, out duck))
            {
                duck = CameraEye + camera.transform.forward * 14f;
                duck.y = PondCenter.y + 0.06f;
            }

            PlaceCreature(factory, fixtures, parent, points, "Сливочный кролик", rabbit + Vector3.up * 0.02f, false);
            PlaceCreature(factory, fixtures, parent, points, "Персиковая свинка", pig + Vector3.up * 0.02f, false);
            PlaceCreature(factory, fixtures, parent, points, "Сиреневый кот", cat + Vector3.up * 0.02f, false);
            PlaceCreature(factory, fixtures, parent, points, "Горчичный пёс", dog + Vector3.up * 0.02f, false);
            PlaceCreature(factory, fixtures, parent, points, "Прудовая уточка", duck, false);
            BillboardCreatures(camera);
        }

        static bool PlaceOnView(Camera camera, Vector3 viewport, float minDist, float maxDist, out Vector3 point)
        {
            Ray ray = camera.ViewportPointToRay(viewport);
            var hits = Physics.RaycastAll(ray, 160f, ~0, QueryTriggerInteraction.Ignore);
            float best = float.PositiveInfinity;
            point = Vector3.zero;
            bool any = false;
            for (int i = 0; i < hits.Length; i++)
            {
                if (hits[i].normal.y < 0.28f || hits[i].distance < minDist || hits[i].distance > maxDist)
                {
                    continue;
                }

                if (hits[i].distance < best)
                {
                    best = hits[i].distance;
                    point = hits[i].point;
                    any = true;
                }
            }

            return any;
        }

        static void PlaceCreature(
            CreatureFactoryV2 factory,
            IReadOnlyList<LoadedFixture> fixtures,
            Transform parent,
            Transform[] points,
            string displayName,
            Vector3 position,
            bool snapGround)
        {
            LoadedFixture fixture = null;
            for (int i = 0; i < fixtures.Count; i++)
            {
                if (fixtures[i].Manifest.DisplayName == displayName)
                {
                    fixture = fixtures[i];
                    break;
                }
            }

            if (fixture == null)
            {
                throw new InvalidDataException("Missing fixture " + displayName);
            }

            var go = factory.Create(fixture, parent, points, 31);
            if (go == null)
            {
                throw new InvalidDataException("Failed to spawn " + displayName);
            }

            go.transform.position = position;
            go.transform.localScale = Vector3.one * 0.84f;
            if (snapGround)
            {
                SnapToGround(go, 0.02f);
            }

            var motor = go.GetComponent<CreatureMotor>();
            if (motor != null)
            {
                motor.enabled = false;
            }

            var spacing = go.GetComponent<CreatureSpacing>();
            if (spacing != null)
            {
                spacing.enabled = false;
            }

            var agent = go.GetComponent<NavMeshAgent>();
            if (agent != null)
            {
                agent.enabled = false;
            }
        }

        static void SetGrade(
            VolumeProfile profile,
            float exposure,
            float contrast,
            float saturation,
            float temperature,
            float bloom,
            float bloomThreshold,
            float vignette)
        {
            if (profile.TryGet(out ChannelMixer mixer))
            {
                mixer.active = false;
            }

            if (profile.TryGet(out ColorAdjustments color))
            {
                color.postExposure.overrideState = true;
                color.postExposure.value = exposure;
                color.contrast.overrideState = true;
                color.contrast.value = contrast;
                color.saturation.overrideState = true;
                color.saturation.value = saturation;
            }

            if (profile.TryGet(out WhiteBalance white))
            {
                white.temperature.overrideState = true;
                white.temperature.value = temperature;
            }

            if (profile.TryGet(out Bloom bloomFx))
            {
                bloomFx.intensity.overrideState = true;
                bloomFx.intensity.value = bloom;
                bloomFx.threshold.overrideState = true;
                bloomFx.threshold.value = bloomThreshold;
            }

            if (profile.TryGet(out Vignette vig))
            {
                vig.intensity.overrideState = true;
                vig.intensity.value = vignette;
            }
        }

        static void ScaleGodRays(float scale, Color tint)
        {
            var systems = Object.FindObjectsByType<ParticleSystem>(FindObjectsInactive.Exclude, FindObjectsSortMode.None);
            for (int i = 0; i < systems.Length; i++)
            {
                if (!systems[i].gameObject.name.Contains("GodRay"))
                {
                    continue;
                }

                var main = systems[i].main;
                main.startColor = tint;
                var t = systems[i].transform;
                Vector3 local = t.localScale;
                t.localScale = new Vector3(local.x, Mathf.Max(8f, local.y) * scale, local.z);
            }
        }

        static void SnapToGround(GameObject go, float extra)
        {
            Vector3 position = go.transform.position;
            Vector3 ground;
            if (RaycastTop(position + Vector3.up * 8f, out ground))
            {
                position.y = ground.y + extra;
                go.transform.position = position;
                return;
            }

            var terrain = FindLandTerrain();
            if (terrain == null)
            {
                return;
            }

            position.y = terrain.SampleHeight(position) + terrain.transform.position.y + extra;
            go.transform.position = position;
        }

        static Color Hex(string value)
        {
            Color color;
            ColorUtility.TryParseHtmlString("#" + value, out color);
            return color;
        }
    }
}
