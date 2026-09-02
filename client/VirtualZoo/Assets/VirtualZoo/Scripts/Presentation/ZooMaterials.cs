using UnityEngine;
using UnityEngine.Rendering;

namespace VirtualZoo.Presentation
{
    public static class ZooMaterials
    {
        public static Material CreateLit(Color color, bool transparent = false)
        {
            var shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null)
            {
                shader = Shader.Find("Sprites/Default");
            }

            var material = new Material(shader);
            if (material.HasProperty("_BaseColor"))
            {
                material.SetColor("_BaseColor", color);
            }

            if (material.HasProperty("_Color"))
            {
                material.SetColor("_Color", color);
            }

            if (material.HasProperty("_Smoothness"))
            {
                material.SetFloat("_Smoothness", 0.22f);
            }

            if (transparent)
            {
                ApplyTransparent(material);
            }

            return material;
        }

        public static Material CreateSpriteMaterial(Texture2D texture)
        {
            var shader = Shader.Find("Sprites/Default");
            if (shader == null)
            {
                shader = Shader.Find("Universal Render Pipeline/Unlit");
            }

            var material = new Material(shader);
            material.mainTexture = texture;
            if (material.HasProperty("_BaseMap"))
            {
                material.SetTexture("_BaseMap", texture);
            }

            if (material.HasProperty("_MainTex"))
            {
                material.SetTexture("_MainTex", texture);
            }

            if (material.HasProperty("_BaseColor"))
            {
                material.SetColor("_BaseColor", Color.white);
            }

            if (material.HasProperty("_Color"))
            {
                material.color = Color.white;
            }

            ApplyTransparent(material);
            material.renderQueue = (int)RenderQueue.Transparent;
            return material;
        }

        public static Material CreateCutoutLit(Texture2D texture)
        {
            var material = CreateLit(Color.white);
            if (material.HasProperty("_BaseMap"))
            {
                material.SetTexture("_BaseMap", texture);
            }

            material.mainTexture = texture;
            if (material.HasProperty("_Cutoff"))
            {
                material.SetFloat("_Cutoff", 0.28f);
            }

            if (material.HasProperty("_AlphaClip"))
            {
                material.SetFloat("_AlphaClip", 1f);
            }

            if (material.HasProperty("_Smoothness"))
            {
                material.SetFloat("_Smoothness", 0.3f);
            }

            material.EnableKeyword("_ALPHATEST_ON");
            material.SetOverrideTag("RenderType", "TransparentCutout");
            material.renderQueue = (int)RenderQueue.AlphaTest;
            if (material.HasProperty("_Cull"))
            {
                material.SetFloat("_Cull", 0f);
            }

            return material;
        }

        public static Material CreateShadowBlob()
        {
            return CreateLit(new Color(0.12f, 0.1f, 0.08f, 0.22f), true);
        }

        static void ApplyTransparent(Material material)
        {
            if (material.HasProperty("_Surface"))
            {
                material.SetFloat("_Surface", 1f);
            }

            if (material.HasProperty("_Blend"))
            {
                material.SetFloat("_Blend", 0f);
            }

            if (material.HasProperty("_Cull"))
            {
                material.SetFloat("_Cull", 0f);
            }

            material.SetOverrideTag("RenderType", "Transparent");
            material.SetInt("_SrcBlend", (int)BlendMode.SrcAlpha);
            material.SetInt("_DstBlend", (int)BlendMode.OneMinusSrcAlpha);
            material.SetInt("_ZWrite", 0);
            material.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            material.DisableKeyword("_ALPHATEST_ON");
            material.renderQueue = (int)RenderQueue.Transparent;
        }
    }
}
