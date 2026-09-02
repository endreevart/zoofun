using UnityEngine;
using VirtualZoo.Domain;

namespace VirtualZoo.Presentation
{
    public static class CreatureViewport
    {
        public const float OverviewMargin = 0.05f;
        public const float MaxOverviewHeight = 0.22f;

        public static int CountFullyInside(Camera camera, float margin)
        {
            int count = 0;
            var all = Object.FindObjectsByType<CreatureIdentity>(FindObjectsSortMode.None);
            for (int i = 0; i < all.Length; i++)
            {
                if (!all[i].gameObject.activeInHierarchy)
                {
                    continue;
                }

                if (IsFacingCamera(camera, all[i]) && FullyInside(camera, all[i], margin))
                {
                    count++;
                }
            }

            return count;
        }

        public static bool AnyClipped(Camera camera, float margin)
        {
            var all = Object.FindObjectsByType<CreatureIdentity>(FindObjectsSortMode.None);
            for (int i = 0; i < all.Length; i++)
            {
                if (!all[i].gameObject.activeInHierarchy || !IsFacingCamera(camera, all[i]))
                {
                    continue;
                }

                if (TouchesFrame(camera, all[i]) && !FullyInside(camera, all[i], margin))
                {
                    return true;
                }
            }

            return false;
        }

        public static bool AnyDominant(Camera camera, float maxHeight)
        {
            var all = Object.FindObjectsByType<CreatureIdentity>(FindObjectsSortMode.None);
            for (int i = 0; i < all.Length; i++)
            {
                if (!all[i].gameObject.activeInHierarchy || !IsFacingCamera(camera, all[i]))
                {
                    continue;
                }

                if (SpriteHeight(camera, all[i]) > maxHeight)
                {
                    return true;
                }
            }

            return false;
        }

        public static bool FullyInside(Camera camera, CreatureIdentity identity, float margin)
        {
            Vector3[] points = BoundPoints(camera, identity);
            for (int i = 0; i < points.Length; i++)
            {
                Vector3 v = camera.WorldToViewportPoint(points[i]);
                if (v.z < 0.4f || v.x < margin || v.x > 1f - margin || v.y < margin || v.y > 1f - margin)
                {
                    return false;
                }
            }

            return true;
        }

        static bool TouchesFrame(Camera camera, CreatureIdentity identity)
        {
            Vector3[] points = BoundPoints(camera, identity);
            for (int i = 0; i < points.Length; i++)
            {
                Vector3 v = camera.WorldToViewportPoint(points[i]);
                if (v.z > 0.2f && v.x > -0.05f && v.x < 1.05f && v.y > -0.05f && v.y < 1.05f)
                {
                    return true;
                }
            }

            return false;
        }

        static bool IsFacingCamera(Camera camera, CreatureIdentity identity)
        {
            Vector3 v = camera.WorldToViewportPoint(identity.transform.position + Vector3.up * 0.4f);
            return v.z > 0.5f;
        }

        static Vector3[] BoundPoints(Camera camera, CreatureIdentity identity)
        {
            var renderer = identity.GetComponentInChildren<SpriteRenderer>();
            if (renderer == null)
            {
                float body = Mathf.Clamp(identity.Scale * 1.5f, 1.15f, 1.85f);
                Vector3 p = identity.transform.position;
                return new[]
                {
                    p,
                    p + Vector3.up * body,
                    p + camera.transform.right * (body * 0.28f) + Vector3.up * (body * 0.5f),
                    p - camera.transform.right * (body * 0.28f) + Vector3.up * (body * 0.5f)
                };
            }

            Bounds bounds = renderer.bounds;
            Vector3 c = bounds.center;
            float halfW = Mathf.Min(bounds.extents.x, bounds.extents.z);
            float halfH = bounds.extents.y;
            Vector3 right = camera.transform.right * halfW;
            Vector3 up = Vector3.up * halfH;
            return new[]
            {
                c + right + up,
                c - right + up,
                c + right - up,
                c - right - up
            };
        }

        static float SpriteHeight(Camera camera, CreatureIdentity identity)
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
    }
}
