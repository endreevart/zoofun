using System.Collections.Generic;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using VirtualZoo.Presentation;

namespace VirtualZoo.EditorTools
{
    public static class KenneyKit
    {
        public const string Models = "Assets/ThirdParty/Kenney/NatureKit/Models/";

        public static GameObject Place(
            string model,
            Transform parent,
            Vector3 position,
            float yaw,
            float extraScale = 1f,
            bool keepCollider = false,
            bool snapFeet = true,
            float targetHeight = 0f,
            bool castShadows = true)
        {
            string path = Models + model + ".fbx";
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (prefab == null)
            {
                throw new System.InvalidOperationException("Missing Kenney Nature Kit model: " + path);
            }

            var go = (GameObject)PrefabUtility.InstantiatePrefab(prefab, parent);
            go.name = model;
            if (go.GetComponent<KenneyProp>() == null)
            {
                go.AddComponent<KenneyProp>();
            }

            go.transform.SetPositionAndRotation(position, Quaternion.identity);
            go.transform.localScale = Vector3.one * extraScale;

            Bounds local = CombinedBounds(go);
            if (local.size.sqrMagnitude < 0.000001f)
            {
                throw new System.InvalidOperationException("Kenney model has empty bounds: " + model);
            }

            if (targetHeight > 0.01f && local.size.y > 0.001f)
            {
                go.transform.localScale *= targetHeight / local.size.y;
            }

            go.transform.rotation = Quaternion.Euler(0f, yaw, 0f);

            if (snapFeet)
            {
                Bounds world = CombinedBounds(go);
                go.transform.position += Vector3.up * (position.y - world.min.y);
            }

            var colliders = go.GetComponentsInChildren<Collider>(true);
            for (int i = 0; i < colliders.Length; i++)
            {
                Object.DestroyImmediate(colliders[i]);
            }

            if (keepCollider)
            {
                Bounds world = CombinedBounds(go);
                var box = go.AddComponent<BoxCollider>();
                box.center = go.transform.InverseTransformPoint(world.center);
                Vector3 lossy = go.transform.lossyScale;
                box.size = new Vector3(
                    SafeDiv(world.size.x, lossy.x),
                    SafeDiv(world.size.y, lossy.y),
                    SafeDiv(world.size.z, lossy.z));
            }

            var renderers = go.GetComponentsInChildren<MeshRenderer>(true);
            for (int i = 0; i < renderers.Length; i++)
            {
                renderers[i].shadowCastingMode = castShadows ? ShadowCastingMode.On : ShadowCastingMode.Off;
                renderers[i].receiveShadows = true;
                WarmifyRenderer(renderers[i]);
            }

            SetStatic(go);
            return go;
        }

        public static void ResetWarmCache()
        {
            WarmCache.Clear();
        }

        static readonly Dictionary<Material, Material> WarmCache = new Dictionary<Material, Material>();

        static void WarmifyRenderer(MeshRenderer renderer)
        {
            var shared = renderer.sharedMaterials;
            if (shared == null || shared.Length == 0)
            {
                return;
            }

            var warmed = new Material[shared.Length];
            bool changed = false;
            for (int i = 0; i < shared.Length; i++)
            {
                warmed[i] = WarmMaterial(shared[i]);
                if (warmed[i] != shared[i])
                {
                    changed = true;
                }
            }

            if (changed)
            {
                renderer.sharedMaterials = warmed;
            }
        }

        static Material WarmMaterial(Material source)
        {
            if (source == null)
            {
                return null;
            }

            if (WarmCache.TryGetValue(source, out var cached) && cached != null)
            {
                return cached;
            }

            Color color = Color.white;
            if (source.HasProperty("_BaseColor"))
            {
                color = source.GetColor("_BaseColor");
            }
            else if (source.HasProperty("_Color"))
            {
                color = source.color;
            }

            Color warm = WarmColor(color);
            float dr = warm.r - color.r;
            float dg = warm.g - color.g;
            float db = warm.b - color.b;
            if (dr * dr + dg * dg + db * db < 0.0004f)
            {
                WarmCache[source] = source;
                return source;
            }

            var clone = new Material(source);
            clone.name = source.name + ".Warm";
            if (clone.HasProperty("_BaseColor"))
            {
                clone.SetColor("_BaseColor", warm);
            }

            if (clone.HasProperty("_Color"))
            {
                clone.SetColor("_Color", warm);
            }

            WarmCache[source] = clone;
            return clone;
        }

        static Color WarmColor(Color color)
        {
            if (color.g > 0.5f && color.b > 0.55f && color.r < 0.4f)
            {
                return new Color(0.46f, 0.74f, 0.40f, color.a);
            }

            if (color.b > 0.75f && color.g > 0.7f && color.r > 0.55f)
            {
                return new Color(0.42f, 0.76f, 0.84f, color.a);
            }

            return new Color(
                Mathf.Min(1f, color.r * 1.06f),
                color.g,
                color.b * 0.86f,
                color.a);
        }

        static void SetStatic(GameObject go)
        {
            go.isStatic = true;
            var transforms = go.GetComponentsInChildren<Transform>(true);
            for (int i = 0; i < transforms.Length; i++)
            {
                transforms[i].gameObject.isStatic = true;
            }
        }

        static Bounds CombinedBounds(GameObject go)
        {
            var renderers = go.GetComponentsInChildren<MeshRenderer>(true);
            if (renderers.Length == 0)
            {
                return new Bounds(go.transform.position, Vector3.zero);
            }

            Bounds bounds = renderers[0].bounds;
            for (int i = 1; i < renderers.Length; i++)
            {
                bounds.Encapsulate(renderers[i].bounds);
            }

            return bounds;
        }

        static float SafeDiv(float value, float divisor)
        {
            return Mathf.Abs(divisor) < 0.0001f ? value : value / divisor;
        }
    }
}
