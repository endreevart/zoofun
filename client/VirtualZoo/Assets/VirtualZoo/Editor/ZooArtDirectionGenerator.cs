using UnityEditor;
using UnityEngine;

namespace VirtualZoo.EditorTools
{
    public static class ZooArtDirectionGenerator
    {
        public static void Generate()
        {
            try
            {
                AssetDatabase.Refresh();
                ZooArtDirectionBuilder.Build();
                AssetDatabase.SaveAssets();
                Debug.Log("ZOO_ART_DIRECTION_GENERATE_OK scene=" + ZooArtDirectionBuilder.ScenePath);
                EditorApplication.Exit(0);
            }
            catch (System.Exception exception)
            {
                Debug.LogError(exception);
                EditorApplication.Exit(1);
            }
        }
    }
}
