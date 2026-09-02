using System.Collections.Generic;
using System.IO;
using UnityEngine;
using UnityEngine.AI;
using VirtualZoo.Domain;
using VirtualZoo.Presentation;

namespace VirtualZoo.EditorTools
{
    public static class EvidenceCapture
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

        public static void CaptureVerified(Camera camera, string evidenceDir)
        {
            if (camera == null)
            {
                throw new System.InvalidOperationException("No camera for evidence capture.");
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
            SetMotorsEnabled(false);

            try
            {
                FrameOverview(camera);
                camera.aspect = 1600f / 1200f;
                camera.fieldOfView = 32f;
                AssertOverviewFraming(camera);

                Write(camera, 1600, 1200, Path.Combine(evidenceDir, "gameview-ipad-4x3.png"));

                camera.aspect = 1920f / 886f;
                AssertOverviewFraming(camera);

                Write(camera, 1920, 886, Path.Combine(evidenceDir, "gameview-iphone-landscape.png"));

                HideAllCreatures();
                camera.aspect = 1600f / 1200f;
                FrameOverview(camera);
                Write(camera, 1600, 1200, Path.Combine(evidenceDir, "environment-clean.png"));
                RestorePoses(poses);

                camera.aspect = 1440f / 1080f;
                camera.fieldOfView = 40f;
                var closeRt = BindCameraTarget(camera, 1440, 1080);
                try
                {
                    CreatureIdentity walk;
                    CreatureIdentity hop;
                    if (!StageWalkAndHop(camera, out walk, out hop))
                    {
                        throw new System.InvalidOperationException("Could not frame a full walk and hop pair.");
                    }

                    WriteBound(camera, closeRt, Path.Combine(evidenceDir, "closeup-walk-hop.png"));
                }
                finally
                {
                    camera.targetTexture = null;
                    RenderTexture.ReleaseTemporary(closeRt);
                }

                RestorePoses(poses);

                var zoneRt = BindCameraTarget(camera, 1440, 1080);
                try
                {
                    CreatureIdentity fly;
                    CreatureIdentity floater;
                    if (!StageFlyAndFloat(camera, out fly, out floater))
                    {
                        throw new System.InvalidOperationException("Could not frame a full fly and float pair.");
                    }

                    WriteBound(camera, zoneRt, Path.Combine(evidenceDir, "zone-fly-float.png"));
                }
                finally
                {
                    camera.targetTexture = null;
                    RenderTexture.ReleaseTemporary(zoneRt);
                }
            }
            finally
            {
                RestorePoses(poses);
                SetMotorsEnabled(true);
                camera.aspect = originalAspect;
                camera.fieldOfView = originalFov;
                camera.transform.SetPositionAndRotation(originalPos, originalRot);
                if (rig != null)
                {
                    rig.Freeze(false);
                }
            }
        }

        static void AssertOverviewFraming(Camera camera)
        {
            int inside = CreatureViewport.CountFullyInside(camera, CreatureViewport.OverviewMargin);
            if (inside < 12)
            {
                throw new System.InvalidOperationException("Overview shows fewer than 12 fully framed animals (" + inside + ").");
            }

            if (CreatureViewport.AnyClipped(camera, CreatureViewport.OverviewMargin))
            {
                throw new System.InvalidOperationException("Overview clips an animal at the frame edge.");
            }

            if (CreatureViewport.AnyDominant(camera, CreatureViewport.MaxOverviewHeight))
            {
                throw new System.InvalidOperationException("Overview has a dominant foreground animal.");
            }
        }

        static void FrameOverview(Camera camera)
        {
            camera.fieldOfView = 32f;
            camera.transform.SetPositionAndRotation(ZooLayout.OverviewCamera, Look(ZooLayout.OverviewCamera, ZooLayout.OverviewFocus));
        }

        static bool StageWalkAndHop(Camera camera, out CreatureIdentity walk, out CreatureIdentity hop)
        {
            walk = Smallest(Collect(LocomotionClass.Walk), 1.12f);
            hop = Smallest(Collect(LocomotionClass.Hop), 1.18f);
            if (walk == null || hop == null)
            {
                return false;
            }

            Vector3 walkPos = new Vector3(0.55f, 0f, -2.15f);
            Vector3 hopPos = new Vector3(2.05f, 0f, -2.0f);
            HideOthers(walk, hop);
            Place(walk, walkPos);
            Place(hop, hopPos);
            Vector3 mid = (walkPos + hopPos) * 0.5f + Vector3.up * 0.72f;
            Vector3 eye = new Vector3(1.28f, 1.55f, -5.05f);
            camera.transform.SetPositionAndRotation(eye, Look(eye, mid));
            return PairFramed(camera, walk, hop, 0.22f) && !Occluded(camera, walk) && !Occluded(camera, hop);
        }

        static bool StageFlyAndFloat(Camera camera, out CreatureIdentity fly, out CreatureIdentity floater)
        {
            fly = Smallest(Collect(LocomotionClass.Fly), 1.2f);
            floater = Smallest(Collect(LocomotionClass.Float), 1.2f);
            if (fly == null || floater == null)
            {
                return false;
            }

            Vector3 pond = ZooLayout.PondCenter;
            HideOthers(fly, floater);
            Vector3 flyPos = new Vector3(pond.x - 0.7f, 1.58f, pond.z + 0.05f);
            Vector3 floatPos = new Vector3(pond.x - 0.85f, ZooLayout.WaterHeight, pond.z - 0.35f);
            Place(fly, flyPos);
            Place(floater, floatPos);
            Vector3 look = new Vector3((flyPos.x + floatPos.x) * 0.5f, 0.85f, (flyPos.z + floatPos.z) * 0.5f);
            Vector3[] eyes =
            {
                new Vector3(pond.x - 0.35f, 2.08f, pond.z - 5.85f),
                new Vector3(pond.x - 0.95f, 2.18f, pond.z - 5.65f),
                new Vector3(pond.x + 0.25f, 2.12f, pond.z - 6.05f),
                new Vector3(pond.x - 0.55f, 2.28f, pond.z - 6.25f),
                new Vector3(pond.x - 0.15f, 2.02f, pond.z - 5.75f)
            };
            for (int i = 0; i < eyes.Length; i++)
            {
                camera.transform.SetPositionAndRotation(eyes[i], Look(eyes[i], look));
                bool visA = FullyVisible(camera, fly, 0.16f);
                bool visB = FullyVisible(camera, floater, 0.16f);
                bool blocked = BlocksLens(camera, fly, floater) || Occluded(camera, fly) || Occluded(camera, floater);
                bool framed = visA && visB &&
                              ViewportHeight(camera, fly) <= 0.55f &&
                              ViewportHeight(camera, floater) <= 0.55f &&
                              !blocked;
                bool water = WaterReadable(camera, floater);
                if (framed && water)
                {
                    return true;
                }
            }

            camera.transform.SetPositionAndRotation(eyes[0], Look(eyes[0], look));
            return PairFramed(camera, fly, floater, 0.15f) &&
                   WaterReadable(camera, floater) &&
                   !Occluded(camera, fly) &&
                   !Occluded(camera, floater);
        }

        static void Place(CreatureIdentity identity, Vector3 position)
        {
            identity.transform.position = position;
            var presentation = identity.GetComponent<CreaturePresentation>();
            if (presentation != null && presentation.VisualRoot != null)
            {
                presentation.VisualRoot.localPosition = Vector3.zero;
                presentation.SetDeformation(1f, 1f);
            }

            var agent = identity.GetComponent<NavMeshAgent>();
            if (agent != null && agent.isOnNavMesh)
            {
                agent.Warp(position);
            }
        }

        static CreatureIdentity Smallest(List<CreatureIdentity> list, float maxScale)
        {
            CreatureIdentity best = null;
            for (int i = 0; i < list.Count; i++)
            {
                if (list[i].Scale > maxScale)
                {
                    continue;
                }

                if (best == null || list[i].Scale < best.Scale)
                {
                    best = list[i];
                }
            }

            return best ?? (list.Count > 0 ? list[0] : null);
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

        static void SetMotorsEnabled(bool enabled)
        {
            var motors = Object.FindObjectsByType<CreatureMotor>(FindObjectsSortMode.None);
            for (int i = 0; i < motors.Length; i++)
            {
                motors[i].enabled = enabled;
            }

            var agents = Object.FindObjectsByType<NavMeshAgent>(FindObjectsSortMode.None);
            for (int i = 0; i < agents.Length; i++)
            {
                if (agents[i].isOnNavMesh)
                {
                    agents[i].isStopped = !enabled;
                }
            }
        }

        static List<CreatureIdentity> Collect(LocomotionClass locomotion)
        {
            var list = new List<CreatureIdentity>();
            var all = Object.FindObjectsByType<CreatureIdentity>(FindObjectsSortMode.None);
            for (int i = 0; i < all.Length; i++)
            {
                if (all[i].Locomotion == locomotion && all[i].gameObject.activeInHierarchy)
                {
                    list.Add(all[i]);
                }
            }

            return list;
        }

        static void HideAllCreatures()
        {
            var all = Object.FindObjectsByType<CreatureIdentity>(FindObjectsSortMode.None);
            for (int i = 0; i < all.Length; i++)
            {
                all[i].gameObject.SetActive(false);
            }
        }

        static bool Occluded(Camera camera, CreatureIdentity identity)
        {
            Vector3 origin = camera.transform.position;
            Vector3 target = identity.transform.position + Vector3.up * 0.65f;
            if (!Physics.Linecast(origin, target, out var hit, Physics.DefaultRaycastLayers, QueryTriggerInteraction.Ignore))
            {
                return false;
            }

            if (hit.collider.transform.IsChildOf(identity.transform) || hit.collider.gameObject.name == "Ground")
            {
                return false;
            }

            return true;
        }

        static bool PairFramed(Camera camera, CreatureIdentity a, CreatureIdentity b, float minHeight)
        {
            return a != null &&
                   b != null &&
                   FullyVisible(camera, a, minHeight) &&
                   FullyVisible(camera, b, minHeight) &&
                   ViewportHeight(camera, a) <= 0.58f &&
                   ViewportHeight(camera, b) <= 0.58f &&
                   !BlocksLens(camera, a, b);
        }

        static bool WaterReadable(Camera camera, CreatureIdentity floater)
        {
            Vector3 water = floater.transform.position;
            water.y = ZooLayout.WaterHeight;
            Vector3[] points =
            {
                water,
                water + new Vector3(0.35f, 0f, 0.15f),
                water + new Vector3(-0.35f, 0f, -0.1f),
                water + new Vector3(0.1f, 0f, 0.4f)
            };
            int visible = 0;
            for (int i = 0; i < points.Length; i++)
            {
                Vector3 v = camera.WorldToViewportPoint(points[i]);
                if (v.z > 0.4f && v.x > 0.06f && v.x < 0.94f && v.y > 0.06f && v.y < 0.72f)
                {
                    visible++;
                }
            }

            return visible >= 3;
        }

        static void HideOthers(params CreatureIdentity[] keep)
        {
            var all = Object.FindObjectsByType<CreatureIdentity>(FindObjectsSortMode.None);
            for (int i = 0; i < all.Length; i++)
            {
                bool keepIt = false;
                for (int k = 0; k < keep.Length; k++)
                {
                    if (all[i] == keep[k])
                    {
                        keepIt = true;
                        break;
                    }
                }

                if (!keepIt)
                {
                    all[i].gameObject.SetActive(false);
                }
            }
        }

        static bool FullyVisible(Camera camera, CreatureIdentity identity, float minHeight)
        {
            if (!CreatureViewport.FullyInside(camera, identity, 0.06f))
            {
                return false;
            }

            float height = ViewportHeight(camera, identity);
            return height >= minHeight && height <= 0.58f;
        }

        static float ViewportHeight(Camera camera, CreatureIdentity identity)
        {
            var renderer = identity.GetComponentInChildren<SpriteRenderer>();
            if (renderer == null)
            {
                return 0f;
            }

            Bounds bounds = renderer.bounds;
            Vector3 bottom = camera.WorldToViewportPoint(new Vector3(bounds.center.x, bounds.min.y, bounds.center.z));
            Vector3 top = camera.WorldToViewportPoint(new Vector3(bounds.center.x, bounds.max.y, bounds.center.z));
            if (bottom.z <= 0.1f || top.z <= 0.1f)
            {
                return 0f;
            }

            return Mathf.Abs(top.y - bottom.y);
        }

        static bool BlocksLens(Camera camera, params CreatureIdentity[] keep)
        {
            var all = Object.FindObjectsByType<SpriteRenderer>(FindObjectsSortMode.None);
            float nearKeep = 1000f;
            for (int k = 0; k < keep.Length; k++)
            {
                float d = Vector3.Distance(camera.transform.position, keep[k].transform.position);
                if (d < nearKeep)
                {
                    nearKeep = d;
                }
            }

            for (int i = 0; i < all.Length; i++)
            {
                bool protectedTarget = false;
                for (int k = 0; k < keep.Length; k++)
                {
                    if (all[i].transform.IsChildOf(keep[k].transform))
                    {
                        protectedTarget = true;
                        break;
                    }
                }

                if (protectedTarget)
                {
                    continue;
                }

                Vector3 v = camera.WorldToViewportPoint(all[i].bounds.center);
                float d = Vector3.Distance(camera.transform.position, all[i].bounds.center);
                Vector3 top = camera.WorldToViewportPoint(all[i].bounds.max);
                Vector3 bottom = camera.WorldToViewportPoint(all[i].bounds.min);
                float occupy = 0f;
                if (top.z > 0.1f && bottom.z > 0.1f)
                {
                    occupy = Mathf.Abs(top.y - bottom.y);
                }

                bool fillsLens = occupy > 0.28f && v.x > 0.16f && v.x < 0.84f && v.z > 0.2f;
                bool standsInFront = v.z > 0.2f && d < nearKeep * 0.88f && v.x > 0.16f && v.x < 0.84f && v.y > 0.12f && v.y < 0.88f;
                if (fillsLens || standsInFront)
                {
                    return true;
                }
            }

            return false;
        }

        static Quaternion Look(Vector3 eye, Vector3 target)
        {
            return Quaternion.LookRotation((target - eye).normalized, Vector3.up);
        }

        static RenderTexture BindCameraTarget(Camera camera, int width, int height)
        {
            var desc = new RenderTextureDescriptor(width, height, RenderTextureFormat.ARGB32, 24)
            {
                msaaSamples = 1,
                sRGB = QualitySettings.activeColorSpace == ColorSpace.Linear,
                useMipMap = false,
                autoGenerateMips = false
            };
            var rt = RenderTexture.GetTemporary(desc);
            camera.targetTexture = rt;
            camera.aspect = (float)width / height;
            return rt;
        }

        static void WriteBound(Camera camera, RenderTexture rt, string path)
        {
            var prevActive = RenderTexture.active;
            camera.targetTexture = rt;
            camera.Render();
            RenderTexture.active = rt;
            var tex = new Texture2D(rt.width, rt.height, TextureFormat.RGB24, false);
            tex.ReadPixels(new Rect(0, 0, rt.width, rt.height), 0, 0);
            tex.Apply();
            RenderTexture.active = prevActive;
            File.WriteAllBytes(path, tex.EncodeToPNG());
            Object.DestroyImmediate(tex);
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
