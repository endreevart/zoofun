using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using VirtualZoo.Presentation;

namespace VirtualZoo.EditorTools
{
    public static class PremiumKit
    {
        public const string Models = "Assets/VirtualZoo/Art/PremiumPrototype/";

        public static GameObject Place(
            string model,
            Transform parent,
            Vector3 position,
            float yaw,
            float extraScale = 1f,
            bool snapFeet = true,
            bool worldSpace = false,
            bool keepCollider = false,
            float targetHeight = 0f,
            bool sway = false)
        {
            string path = Models + model + ".fbx";
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (prefab == null)
            {
                throw new System.InvalidOperationException("Missing premium prototype model: " + path);
            }

            var go = (GameObject)PrefabUtility.InstantiatePrefab(prefab, parent);
            go.name = model;
            if (go.GetComponent<PremiumProp>() == null)
            {
                go.AddComponent<PremiumProp>();
            }

            if (worldSpace)
            {
                go.transform.SetPositionAndRotation(Vector3.zero, Quaternion.identity);
                go.transform.localScale = Vector3.one * extraScale;
            }
            else
            {
                go.transform.SetPositionAndRotation(position, Quaternion.identity);
                go.transform.localScale = Vector3.one * extraScale;
                Bounds local = CombinedBounds(go);
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
                renderers[i].shadowCastingMode = ShadowCastingMode.On;
                renderers[i].receiveShadows = true;
            }

            if (sway)
            {
                var foliage = go.AddComponent<FoliageSway>();
                foliage.Configure(2.1f + Mathf.Abs(yaw) % 1.4f, 0.9f + extraScale * 0.12f, position.x * 0.37f + position.z * 0.21f);
            }

            return go;
        }

        public static void SetMaterials(GameObject go, params Material[] materials)
        {
            if (go == null || materials == null || materials.Length == 0)
            {
                return;
            }

            var renderers = go.GetComponentsInChildren<MeshRenderer>(true);
            for (int i = 0; i < renderers.Length; i++)
            {
                if (renderers[i].sharedMaterials != null && renderers[i].sharedMaterials.Length >= 2 && materials.Length >= 2)
                {
                    var assigned = new Material[renderers[i].sharedMaterials.Length];
                    for (int m = 0; m < assigned.Length; m++)
                    {
                        assigned[m] = materials[m < materials.Length ? m : materials.Length - 1];
                    }

                    renderers[i].sharedMaterials = assigned;
                }
                else
                {
                    renderers[i].sharedMaterial = materials[0];
                }
            }
        }

        public static Mesh LoadMesh(string model)
        {
            string path = Models + model + ".fbx";
            var assets = AssetDatabase.LoadAllAssetsAtPath(path);
            Mesh best = null;
            int verts = 0;
            for (int i = 0; i < assets.Length; i++)
            {
                var mesh = assets[i] as Mesh;
                if (mesh != null && mesh.vertexCount > verts)
                {
                    best = mesh;
                    verts = mesh.vertexCount;
                }
            }

            if (best == null)
            {
                throw new System.InvalidOperationException("Missing mesh in " + path);
            }

            return best;
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
