using UnityEditor;
using UnityEngine;

namespace VirtualZoo.EditorTools
{
    public static class ZooIdyllicGardenGenerator
    {
        public static void Generate()
        {
            try
            {
                AssetDatabase.Refresh();
                ZooIdyllicGardenBuilder.Build();
                AssetDatabase.SaveAssets();
                Debug.Log("ZOO_IDYLLIC_GENERATE_OK scene=" + ZooIdyllicGardenBuilder.ScenePath);
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
