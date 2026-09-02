using System.Collections.Generic;
using System.IO;
using UnityEngine;
using UnityEngine.AI;
using VirtualZoo.Domain;
using VirtualZoo.Presentation;

namespace VirtualZoo.EditorTools
{
    public static class IdyllicEvidenceCapture
    {
        struct Pose
        {
            public Transform Transform;
            public Vector3 Position;
            public Quaternion Rotation;
            public bool AgentEnabled;
            public bool MotorEnabled;
            public bool SpacingEnabled;
            public bool Active;
        }

        public static void CaptureEnvironment(Camera camera, string evidenceDir)
        {
            if (camera == null)
            {
                throw new System.InvalidOperationException("No camera for idyllic evidence.");
            }

            var rig = camera.GetComponentInParent<ZooCameraRig>();
            if (rig != null)
            {
                rig.Freeze(true);
            }

            Vector3 originalPos = camera.transform.position;
            Quaternion originalRot = camera.transform.rotation;
            float originalAspect = camera.aspect;
            float originalFov = camera.fieldOfView;
            List<Pose> poses = SnapshotPoses();
            try
            {
                HideCreatures();
                camera.aspect = 1600f / 1200f;
                camera.fieldOfView = IdyllicLayout.CameraFov;
                FrameHero(camera);
                Write(camera, 1600, 1200, Path.Combine(evidenceDir, "scratch-env-ipad-4x3.png"));
                camera.aspect = 1920f / 886f;
                Write(camera, 1920, 886, Path.Combine(evidenceDir, "scratch-env-iphone-landscape.png"));
                camera.aspect = 1920f / 1080f;
                Write(camera, 1920, 1080, Path.Combine(evidenceDir, "scratch-env-clean.png"));
                camera.fieldOfView = 34f;
                camera.transform.SetPositionAndRotation(IdyllicLayout.PondCamera, Look(IdyllicLayout.PondCamera, IdyllicLayout.PondFocus));
                Write(camera, 1600, 1200, Path.Combine(evidenceDir, "scratch-pond-bridge.png"));
            }
            finally
            {
                RestorePoses(poses);
                camera.aspect = originalAspect;
                camera.fieldOfView = originalFov;
                camera.transform.SetPositionAndRotation(originalPos, originalRot);
                if (rig != null)
                {
                    rig.Freeze(false);
                }
            }
        }

        public static void CaptureStills(Camera camera, string evidenceDir)
        {
            if (camera == null)
            {
                throw new System.InvalidOperationException("No camera for idyllic evidence.");
            }

            var rig = camera.GetComponentInParent<ZooCameraRig>();
            if (rig != null)
            {
                rig.Freeze(true);
            }

            Vector3 originalPos = camera.transform.position;
            Quaternion originalRot = camera.transform.rotation;
            float originalAspect = camera.aspect;
            float originalFov = camera.fieldOfView;
            List<Pose> poses = SnapshotPoses();

            try
            {
                FrameHero(camera);
                BillboardAll(camera);
                camera.aspect = 1600f / 1200f;
                camera.fieldOfView = IdyllicLayout.CameraFov;
                Write(camera, 1600, 1200, Path.Combine(evidenceDir, "hero-ipad-4x3.png"));

                camera.aspect = 1920f / 886f;
                Write(camera, 1920, 886, Path.Combine(evidenceDir, "hero-iphone-landscape.png"));

                HideCreatures();
                camera.aspect = 1920f / 1080f;
                FrameHero(camera);
                Write(camera, 1920, 1080, Path.Combine(evidenceDir, "environment-clean.png"));

                camera.fieldOfView = 34f;
                camera.transform.SetPositionAndRotation(IdyllicLayout.PondCamera, Look(IdyllicLayout.PondCamera, IdyllicLayout.PondFocus));
                Write(camera, 1600, 1200, Path.Combine(evidenceDir, "pond-bridge-closeup.png"));

                camera.transform.SetPositionAndRotation(IdyllicLayout.GateCamera, Look(IdyllicLayout.GateCamera, IdyllicLayout.GateFocus));
                Write(camera, 1600, 1200, Path.Combine(evidenceDir, "gate-path-closeup.png"));
                RestorePoses(poses);

                RestorePoses(poses);
                CreatureIdentity walk = Pick(LocomotionClass.Walk);
                CreatureIdentity hop = Pick(LocomotionClass.Hop);
                if (walk != null)
                {
                    HideOthers(walk, hop);
                    Place(walk, IdyllicLayout.CloseupStand);
                    if (hop != null)
                    {
                    Place(hop, IdyllicLayout.CloseupStand + new Vector3(0.95f, 0f, 0.18f));
                    }

                    Vector3 eye = IdyllicLayout.CloseupCamera;
                    Vector3 look = IdyllicLayout.CloseupStand + new Vector3(0.8f, 0.5f, 0.2f);
                    camera.fieldOfView = 34f;
                    camera.transform.SetPositionAndRotation(eye, Look(eye, look));
                    FaceCamera(walk, camera);
                    FaceCamera(hop, camera);
                }

                Write(camera, 1440, 1080, Path.Combine(evidenceDir, "closeup-walk-hop.png"));
                RestorePoses(poses);

                CreatureIdentity lit = Pick(LocomotionClass.Walk);
                if (lit != null)
                {
                    HideOthers(lit, null);
                    Place(lit, IdyllicLayout.CloseupStand);
                    camera.aspect = 1440f / 1080f;
                    camera.fieldOfView = 32f;
                    camera.transform.SetPositionAndRotation(
                        IdyllicLayout.LightingCloseupCamera,
                        Look(IdyllicLayout.LightingCloseupCamera, IdyllicLayout.LightingCloseupFocus));
                    FaceCamera(lit, camera);
                }

                Write(camera, 1440, 1080, Path.Combine(evidenceDir, "creature-lighting-closeup.png"));
                RestorePoses(poses);

                CreatureIdentity fly = Pick(LocomotionClass.Fly);
                CreatureIdentity floater = Pick(LocomotionClass.Float);
                if (fly != null && floater != null)
                {
                    HideOthers(fly, floater);
                    Place(fly, IdyllicLayout.PondCenter + new Vector3(0.55f, 1.22f, -0.15f));
                    Place(floater, IdyllicLayout.PondCenter + new Vector3(0.22f, IdyllicLayout.WaterHeight + 0.05f, -0.72f));
                }

                camera.aspect = 1440f / 1080f;
                camera.fieldOfView = 38f;
                camera.transform.SetPositionAndRotation(IdyllicLayout.FlyFloatCamera, Look(IdyllicLayout.FlyFloatCamera, IdyllicLayout.FlyFloatFocus));
                FaceCamera(fly, camera);
                FaceCamera(floater, camera);
                Write(camera, 1440, 1080, Path.Combine(evidenceDir, "zone-fly-float.png"));

                ComposeReference(evidenceDir);
            }
            finally
            {
                RestorePoses(poses);
                camera.aspect = originalAspect;
                camera.fieldOfView = originalFov;
                camera.transform.SetPositionAndRotation(originalPos, originalRot);
                if (rig != null)
                {
                    rig.Freeze(false);
                }
            }
        }

        public static void CaptureMotionFrame(Camera camera, string evidenceDir, int index, float time)
        {
            var rig = camera.GetComponentInParent<ZooCameraRig>();
            if (rig != null)
            {
                rig.NudgeForSoak(time);
            }

            camera.aspect = 1600f / 900f;
            camera.fieldOfView = IdyllicLayout.CameraFov;
            Write(camera, 1600, 900, Path.Combine(evidenceDir, "motion-" + index.ToString("00") + ".png"));
        }

        static void FrameHero(Camera camera)
        {
            camera.fieldOfView = IdyllicLayout.CameraFov;
            camera.transform.SetPositionAndRotation(
                IdyllicLayout.HeroCamera,
                Look(IdyllicLayout.HeroCamera, IdyllicLayout.HeroFocus));
        }

        static void ComposeReference(string evidenceDir)
        {
            string referencePath = Path.GetFullPath(Path.Combine(UnityEngine.Application.dataPath, "..", "..", "..", "handoff", "references", "virtual-zoo-art-direction-v1.png"));
            string heroPath = Path.Combine(evidenceDir, "hero-ipad-4x3.png");
            if (!File.Exists(referencePath) || !File.Exists(heroPath))
            {
                throw new System.InvalidOperationException("Missing reference or hero still for comparison.");
            }

            var refBytes = File.ReadAllBytes(referencePath);
            var heroBytes = File.ReadAllBytes(heroPath);
            var refTex = new Texture2D(2, 2, TextureFormat.RGB24, false);
            var heroTex = new Texture2D(2, 2, TextureFormat.RGB24, false);
            refTex.LoadImage(refBytes, false);
            heroTex.LoadImage(heroBytes, false);
            int height = 1080;
            int refW = Mathf.Max(1, Mathf.RoundToInt(height * ((float)refTex.width / Mathf.Max(1, refTex.height))));
            int heroW = Mathf.Max(1, Mathf.RoundToInt(height * ((float)heroTex.width / Mathf.Max(1, heroTex.height))));
            var left = Scale(refTex, refW, height);
            var right = Scale(heroTex, heroW, height);
            int width = refW + heroW + 24;
            var composed = new Texture2D(width, height, TextureFormat.RGB24, false);
            Fill(composed, new Color(0.12f, 0.1f, 0.08f));
            Blit(composed, left, 0, 0);
            Blit(composed, right, refW + 24, 0);
            File.WriteAllBytes(Path.Combine(evidenceDir, "reference-comparison.png"), composed.EncodeToPNG());
            Object.DestroyImmediate(refTex);
            Object.DestroyImmediate(heroTex);
            Object.DestroyImmediate(left);
            Object.DestroyImmediate(right);
            Object.DestroyImmediate(composed);
        }

        static Texture2D Scale(Texture2D source, int width, int height)
        {
            var rt = RenderTexture.GetTemporary(width, height, 0, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB);
            Graphics.Blit(source, rt);
            var prev = RenderTexture.active;
            RenderTexture.active = rt;
            var dest = new Texture2D(width, height, TextureFormat.RGB24, false);
            dest.ReadPixels(new Rect(0, 0, width, height), 0, 0);
            dest.Apply();
            RenderTexture.active = prev;
            RenderTexture.ReleaseTemporary(rt);
            return dest;
        }

        static void Fill(Texture2D tex, Color color)
        {
            var pixels = new Color[tex.width * tex.height];
            for (int i = 0; i < pixels.Length; i++)
            {
                pixels[i] = color;
            }

            tex.SetPixels(pixels);
        }

        static void Blit(Texture2D dest, Texture2D source, int x, int y)
        {
            dest.SetPixels(x, y, source.width, source.height, source.GetPixels());
            dest.Apply();
        }

        static CreatureIdentity Pick(LocomotionClass locomotion)
        {
            var all = Object.FindObjectsByType<CreatureIdentity>(FindObjectsSortMode.None);
            for (int i = 0; i < all.Length; i++)
            {
                if (all[i].Locomotion == locomotion)
                {
                    return all[i];
                }
            }

            return null;
        }

        static void Place(CreatureIdentity identity, Vector3 position)
        {
            if (identity == null)
            {
                return;
            }

            var motor = identity.GetComponent<CreatureMotor>();
            if (motor != null)
            {
                motor.enabled = false;
            }

            var spacing = identity.GetComponent<CreatureSpacing>();
            if (spacing != null)
            {
                spacing.enabled = false;
            }

            var agent = identity.GetComponent<NavMeshAgent>();
            if (agent != null)
            {
                agent.enabled = false;
            }

            identity.transform.position = position;
            var visual = identity.GetComponent<ICreatureVisual>();
            if (visual != null && visual.VisualRoot != null)
            {
                visual.VisualRoot.localPosition = Vector3.zero;
                visual.SetDeformation(1f, 1f);
            }
        }

        static List<Pose> SnapshotPoses()
        {
            var poses = new List<Pose>();
            var all = Object.FindObjectsByType<CreatureIdentity>(FindObjectsSortMode.None);
            for (int i = 0; i < all.Length; i++)
            {
                var agent = all[i].GetComponent<NavMeshAgent>();
                var motor = all[i].GetComponent<CreatureMotor>();
                var spacing = all[i].GetComponent<CreatureSpacing>();
                poses.Add(new Pose
                {
                    Transform = all[i].transform,
                    Position = all[i].transform.position,
                    Rotation = all[i].transform.rotation,
                    AgentEnabled = agent != null && agent.enabled,
                    MotorEnabled = motor != null && motor.enabled,
                    SpacingEnabled = spacing != null && spacing.enabled,
                    Active = all[i].gameObject.activeSelf
                });
            }

            return poses;
        }

        static void RestorePoses(List<Pose> poses)
        {
            for (int i = 0; i < poses.Count; i++)
            {
                if (poses[i].Transform == null)
                {
                    continue;
                }

                poses[i].Transform.SetPositionAndRotation(poses[i].Position, poses[i].Rotation);
                poses[i].Transform.gameObject.SetActive(poses[i].Active);
                var agent = poses[i].Transform.GetComponent<NavMeshAgent>();
                if (agent != null && agent.isOnNavMesh)
                {
                    agent.Warp(poses[i].Position);
                    agent.enabled = poses[i].AgentEnabled;
                }

                var motor = poses[i].Transform.GetComponent<CreatureMotor>();
                if (motor != null)
                {
                    motor.enabled = poses[i].MotorEnabled;
                }

                var spacing = poses[i].Transform.GetComponent<CreatureSpacing>();
                if (spacing != null)
                {
                    spacing.enabled = poses[i].SpacingEnabled;
                }
            }
        }

        static void HideCreatures()
        {
            var all = Object.FindObjectsByType<CreatureIdentity>(FindObjectsSortMode.None);
            for (int i = 0; i < all.Length; i++)
            {
                all[i].gameObject.SetActive(false);
            }
        }

        static void HideOthers(CreatureIdentity keepA, CreatureIdentity keepB)
        {
            var all = Object.FindObjectsByType<CreatureIdentity>(FindObjectsSortMode.None);
            for (int i = 0; i < all.Length; i++)
            {
                if (all[i] != keepA && all[i] != keepB)
                {
                    all[i].gameObject.SetActive(false);
                }
            }
        }

        static void BillboardAll(Camera camera)
        {
            var all = Object.FindObjectsByType<CreaturePresentationV2>(FindObjectsSortMode.None);
            for (int i = 0; i < all.Length; i++)
            {
                if (all[i] != null && all[i].isActiveAndEnabled)
                {
                    all[i].BillboardNow();
                }
            }
        }

        static void FaceCamera(CreatureIdentity identity, Camera camera)
        {
            if (identity == null)
            {
                return;
            }

            var presentation = identity.GetComponent<CreaturePresentationV2>();
            if (presentation != null)
            {
                presentation.BillboardNow();
            }
        }

        static Quaternion Look(Vector3 eye, Vector3 target)
        {
            return Quaternion.LookRotation((target - eye).normalized, Vector3.up);
        }

        static void Write(Camera camera, int width, int height, string path)
        {
            var desc = new RenderTextureDescriptor(width, height, RenderTextureFormat.ARGB32, 24)
            {
                msaaSamples = 1,
                sRGB = QualitySettings.activeColorSpace == ColorSpace.Linear,
                useMipMap = false,
                autoGenerateMips = false
            };
            var rt = RenderTexture.GetTemporary(desc);
            var prevTarget = camera.targetTexture;
            var prevActive = RenderTexture.active;
            camera.targetTexture = rt;
            camera.aspect = (float)width / height;
            camera.Render();
            camera.Render();
            RenderTexture.active = rt;
            var tex = new Texture2D(width, height, TextureFormat.RGB24, false);
            tex.ReadPixels(new Rect(0, 0, width, height), 0, 0);
            tex.Apply();
            camera.targetTexture = prevTarget;
            RenderTexture.active = prevActive;
            File.WriteAllBytes(path, tex.EncodeToPNG());
            Object.DestroyImmediate(tex);
            RenderTexture.ReleaseTemporary(rt);
        }
    }
}
