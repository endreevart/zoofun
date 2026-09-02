using UnityEditor;
using UnityEngine;

namespace VirtualZoo.EditorTools
{
    public sealed class KenneyModelImport : AssetPostprocessor
    {
        const string Root = "Assets/ThirdParty/Kenney/NatureKit/";

        void OnPreprocessModel()
        {
            if (!IsKenney(assetPath))
            {
                return;
            }

            var importer = (ModelImporter)assetImporter;
            importer.globalScale = 1f;
            importer.useFileScale = true;
            importer.bakeAxisConversion = true;
            importer.meshCompression = ModelImporterMeshCompression.Low;
            importer.isReadable = false;
            importer.addCollider = false;
            importer.importBlendShapes = false;
            importer.importVisibility = false;
            importer.importCameras = false;
            importer.importLights = false;
            importer.animationType = ModelImporterAnimationType.None;
            importer.materialImportMode = ModelImporterMaterialImportMode.ImportViaMaterialDescription;
            importer.materialLocation = ModelImporterMaterialLocation.InPrefab;
        }

        void OnPostprocessMaterial(Material material)
        {
            if (!IsKenney(assetPath) || material == null)
            {
                return;
            }

            var urp = Shader.Find("Universal Render Pipeline/Lit");
            if (urp == null || material.shader == urp)
            {
                return;
            }

            Color color = Color.white;
            if (material.HasProperty("_Color"))
            {
                color = material.color;
            }

            material.shader = urp;
            if (material.HasProperty("_BaseColor"))
            {
                material.SetColor("_BaseColor", color);
            }

            if (material.HasProperty("_Smoothness"))
            {
                material.SetFloat("_Smoothness", 0.18f);
            }
        }

        static bool IsKenney(string path)
        {
            return path.Replace('\\', '/').StartsWith(Root);
        }
    }
}
