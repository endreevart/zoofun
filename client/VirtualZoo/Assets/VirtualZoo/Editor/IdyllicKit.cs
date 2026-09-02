using UnityEditor;
using UnityEngine;
using UnityEngine.AI;
using VirtualZoo.Presentation;

namespace VirtualZoo.EditorTools
{
    public static class IdyllicKit
    {
        public const string PrefabRoot = "Assets/Idyllic Fantasy Nature/Prefabs/";

        public static GameObject Place(
            string prefabName,
            Transform parent,
            Vector3 position,
            float yaw,
            float uniformScale,
            bool snapFeet,
            bool obstacle)
        {
            string path = PrefabRoot + prefabName + ".prefab";
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (prefab == null)
            {
                throw new System.InvalidOperationException("Missing Idyllic prefab: " + path);
            }

            var go = (GameObject)PrefabUtility.InstantiatePrefab(prefab, parent);
            go.name = prefabName;
            var marker = go.GetComponent<IdyllicProp>();
            if (marker == null)
            {
                marker = go.AddComponent<IdyllicProp>();
            }

            marker.Bind(prefabName);
            go.transform.SetPositionAndRotation(position, Quaternion.Euler(0f, yaw, 0f));
            go.transform.localScale = Vector3.one * uniformScale;
            if (snapFeet)
            {
                Bounds world = CombinedBounds(go);
                if (world.size.sqrMagnitude > 0.0001f)
                {
                    go.transform.position += Vector3.up * (position.y - world.min.y);
                }
            }

            if (obstacle)
            {
                EnsureObstacle(go);
            }

            go.isStatic = false;
            GameObjectUtility.SetStaticEditorFlags(
                go,
                StaticEditorFlags.BatchingStatic | StaticEditorFlags.NavigationStatic);
            return go;
        }

        public static void EnsureObstacle(GameObject go)
        {
            Bounds world = CombinedBounds(go);
            if (world.size.sqrMagnitude < 0.01f)
            {
                return;
            }

            var box = go.GetComponent<BoxCollider>();
            if (box == null)
            {
                box = go.AddComponent<BoxCollider>();
            }

            Vector3 lossy = go.transform.lossyScale;
            box.center = go.transform.InverseTransformPoint(world.center);
            box.size = new Vector3(
                SafeDiv(world.size.x, lossy.x),
                SafeDiv(world.size.y, lossy.y),
                SafeDiv(world.size.z, lossy.z));

            var obstacle = go.GetComponent<NavMeshObstacle>();
            if (obstacle == null)
            {
                obstacle = go.AddComponent<NavMeshObstacle>();
            }

            obstacle.carving = true;
            obstacle.shape = NavMeshObstacleShape.Box;
            obstacle.center = box.center;
            obstacle.size = box.size;
        }

        public static Bounds CombinedBounds(GameObject go)
        {
            var renderers = go.GetComponentsInChildren<Renderer>(true);
            var bounds = new Bounds(go.transform.position, Vector3.zero);
            bool any = false;
            for (int i = 0; i < renderers.Length; i++)
            {
                if (!renderers[i].enabled)
                {
                    continue;
                }

                if (!any)
                {
                    bounds = renderers[i].bounds;
                    any = true;
                }
                else
                {
                    bounds.Encapsulate(renderers[i].bounds);
                }
            }

            return bounds;
        }

        static float SafeDiv(float value, float divisor)
        {
            return Mathf.Abs(divisor) < 0.0001f ? value : value / divisor;
        }
    }
}
