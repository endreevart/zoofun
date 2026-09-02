using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEngine;

namespace VirtualZoo.EditorTools
{
    public static class ZooContentGenerator
    {
        public static void Generate()
        {
            try
            {
                EnsureFolders();
                PlayerSettings.SetArchitecture(NamedBuildTarget.Standalone, 1);
                PlayerSettings.SetArchitecture(NamedBuildTarget.iOS, 1);
                string fixturesRoot = Path.Combine(UnityEngine.Application.streamingAssetsPath, "VirtualZoo", "Fixtures");
                if (Directory.Exists(fixturesRoot))
                {
                    Directory.Delete(fixturesRoot, true);
                }

                Directory.CreateDirectory(fixturesRoot);
                foreach (var recipe in FixtureRecipes.All())
                {
                    FixtureRasterizer.Write(recipe, fixturesRoot);
                }

                string legacy = Path.Combine(UnityEngine.Application.dataPath, "VirtualZoo", "Fixtures");
                if (Directory.Exists(legacy))
                {
                    Directory.Delete(legacy, true);
                    string legacyMeta = legacy + ".meta";
                    if (File.Exists(legacyMeta))
                    {
                        File.Delete(legacyMeta);
                    }
                }

                AssetDatabase.Refresh();
                ZooSceneBuilder.Build();
                AssetDatabase.SaveAssets();
                Debug.Log("VirtualZoo content generated: " + FixtureRecipes.All().Length + " bundled fixtures in StreamingAssets.");
                EditorApplication.Exit(0);
            }
            catch (System.Exception exception)
            {
                Debug.LogError(exception);
                EditorApplication.Exit(1);
            }
        }

        static void EnsureFolders()
        {
            CreateFolder("Assets", "StreamingAssets");
            CreateFolder("Assets/StreamingAssets", "VirtualZoo");
            CreateFolder("Assets/StreamingAssets/VirtualZoo", "Fixtures");
            CreateFolder("Assets", "VirtualZoo");
            CreateFolder("Assets/VirtualZoo", "Art");
            CreateFolder("Assets/VirtualZoo", "Prefabs");
            CreateFolder("Assets/VirtualZoo", "Scenes");
            CreateFolder("Assets/VirtualZoo", "Scripts");
            CreateFolder("Assets/VirtualZoo", "Tests");
        }

        static void CreateFolder(string parent, string name)
        {
            string path = parent + "/" + name;
            if (!AssetDatabase.IsValidFolder(path))
            {
                AssetDatabase.CreateFolder(parent, name);
            }
        }
    }
}
