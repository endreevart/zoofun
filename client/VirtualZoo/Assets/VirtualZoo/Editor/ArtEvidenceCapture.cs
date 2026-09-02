using System.Collections.Generic;
using System.IO;
using UnityEngine;
using UnityEngine.AI;
using VirtualZoo.Domain;
using VirtualZoo.Presentation;

namespace VirtualZoo.EditorTools
{
    public static class ArtEvidenceCapture
    {
        struct Pose
        {
            public Transform Transform;
            public Vector3 Position;
            public Quaternion Rotation;
            public bool AgentEnabled;
            public bool MotorEnabled;
            public bool Active;
        }

        public static void CaptureStills(Camera camera, string evidenceDir)
        {
            if (camera == null)
            {
                throw new System.InvalidOperationException("No camera for art-direction evidence.");
            }

            var rig = camera.GetComponentInParent<ArtCameraRig>();
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
                camera.aspect = 1920f / 1080f;
                camera.fieldOfView = ArtLayout.HeroFov;
                Write(camera, 1920, 1080, Path.Combine(evidenceDir, "art-direction-hero-16x9.png"));

                camera.aspect = 1600f / 1200f;
                Write(camera, 1600, 1200, Path.Combine(evidenceDir, "art-direction-hero-4x3.png"));

                HideCreatures();
                camera.aspect = 1920f / 1080f;
                FrameHero(camera);
                Write(camera, 1920, 1080, Path.Combine(evidenceDir, "art-direction-environment-only.png"));
                RestorePoses(poses);

                camera.aspect = 1440f / 1080f;
                camera.fieldOfView = 34f;
                camera.transform.SetPositionAndRotation(ArtLayout.PondCamera, Look(ArtLayout.PondCamera, ArtLayout.PondFocus));
                Write(camera, 1440, 1080, Path.Combine(evidenceDir, "art-direction-pond-bridge.png"));

                RestorePoses(poses);
                CreatureIdentity close = PickCloseup();
                if (close != null)
                {
                    HideOthers(close);
                    Vector3 stand = new Vector3(3.65f, 0f, -2.85f);
                    if (close.Locomotion == LocomotionClass.Float)
                    {
                        stand = ArtLayout.PondCenter + new Vector3(-0.35f, ArtLayout.WaterHeight, -0.15f);
                    }
                    else if (close.Locomotion == LocomotionClass.Fly)
                    {
                        stand = new Vector3(1.05f, 1.35f, -1.55f);
                    }

                    Place(close, stand);
                    Vector3 eye = ArtLayout.CloseupCamera;
                    Vector3 look = stand + Vector3.up * 0.52f;
                    camera.fieldOfView = 34f;
                    camera.transform.SetPositionAndRotation(eye, Look(eye, look));
                }

                Write(camera, 1440, 1080, Path.Combine(evidenceDir, "art-direction-closeup-creature.png"));
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
            var rig = camera.GetComponentInParent<ArtCameraRig>();
            if (rig != null)
            {
                rig.NudgeForSoak(time);
            }

            camera.aspect = 1600f / 900f;
            camera.fieldOfView = ArtLayout.HeroFov;
            Write(camera, 1600, 900, Path.Combine(evidenceDir, "art-direction-motion-" + index.ToString("00") + ".png"));
        }

        static void FrameHero(Camera camera)
        {
            camera.fieldOfView = ArtLayout.HeroFov;
            camera.transform.SetPositionAndRotation(ArtLayout.HeroCamera, Look(ArtLayout.HeroCamera, ArtLayout.HeroFocus));
        }

        static CreatureIdentity PickCloseup()
        {
            var all = Object.FindObjectsByType<CreatureIdentity>(FindObjectsSortMode.None);
            CreatureIdentity walk = null;
            for (int i = 0; i < all.Length; i++)
            {
                if (all[i].Locomotion == LocomotionClass.Walk)
                {
                    if (walk == null || all[i].Scale < walk.Scale)
                    {
                        walk = all[i];
                    }
                }
            }

            return walk != null ? walk : (all.Length > 0 ? all[0] : null);
        }

        static void Place(CreatureIdentity identity, Vector3 position)
        {
            identity.transform.position = position;
            var visual = identity.GetComponent<ICreatureVisual>();
            if (visual != null && visual.VisualRoot != null)
            {
                visual.VisualRoot.localPosition = Vector3.zero;
                visual.SetDeformation(1f, 1f);
            }

            var agent = identity.GetComponent<NavMeshAgent>();
            if (agent != null && agent.isOnNavMesh)
            {
                agent.Warp(position);
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
                poses.Add(new Pose
                {
                    Transform = all[i].transform,
                    Position = all[i].transform.position,
                    Rotation = all[i].transform.rotation,
                    AgentEnabled = agent != null && agent.enabled,
                    MotorEnabled = motor != null && motor.enabled,
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

        static void HideOthers(CreatureIdentity keep)
        {
            var all = Object.FindObjectsByType<CreatureIdentity>(FindObjectsSortMode.None);
            for (int i = 0; i < all.Length; i++)
            {
                if (all[i] != keep)
                {
                    all[i].gameObject.SetActive(false);
                }
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
