using UnityEditor;
using UnityEngine;

namespace VirtualZoo.EditorTools
{
    public sealed class PremiumModelImport : AssetPostprocessor
    {
        const string Root = "Assets/VirtualZoo/Art/PremiumPrototype/";

        void OnPreprocessModel()
        {
            if (!IsPremium(assetPath))
            {
                return;
            }

            var importer = (ModelImporter)assetImporter;
            importer.globalScale = 1f;
            importer.useFileScale = true;
            importer.bakeAxisConversion = true;
            importer.meshCompression = ModelImporterMeshCompression.Off;
            importer.isReadable = false;
            importer.addCollider = false;
            importer.importBlendShapes = false;
            importer.importVisibility = false;
            importer.importCameras = false;
            importer.importLights = false;
            importer.animationType = ModelImporterAnimationType.None;
            importer.materialImportMode = ModelImporterMaterialImportMode.ImportViaMaterialDescription;
            importer.materialLocation = ModelImporterMaterialLocation.InPrefab;
            importer.weldVertices = true;
        }

        void OnPreprocessTexture()
        {
            if (!assetPath.Replace('\\', '/').StartsWith(Root + "Textures/"))
            {
                return;
            }

            var importer = (TextureImporter)assetImporter;
            importer.sRGBTexture = true;
            importer.wrapMode = TextureWrapMode.Repeat;
            importer.filterMode = FilterMode.Bilinear;
            importer.anisoLevel = 4;
            importer.mipmapEnabled = true;
            importer.maxTextureSize = 512;
            importer.textureCompression = TextureImporterCompression.Uncompressed;
        }

        void OnPostprocessMaterial(Material material)
        {
            if (!IsPremium(assetPath) || material == null)
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
                material.SetFloat("_Smoothness", 0.22f);
            }
        }

        static bool IsPremium(string path)
        {
            return path.Replace('\\', '/').StartsWith(Root);
        }
    }
}
