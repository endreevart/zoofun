using System.IO;
using System.Security.Cryptography;
using UnityEngine;
using VirtualZoo.Domain;
using VirtualZoo.Infrastructure;

namespace VirtualZoo.EditorTools
{
    public static class FixtureRasterizer
    {
        const int Size = 512;

        public static CreatureManifest Write(FixtureRecipe recipe, string fixturesRoot)
        {
            var pixels = new Color32[Size * Size];
            for (int i = 0; i < pixels.Length; i++)
            {
                pixels[i] = new Color32(0, 0, 0, 0);
            }

            foreach (var stamp in recipe.Stamps)
            {
                StampEllipse(pixels, stamp, 1.06f, Darken(stamp.Color, 0.82f));
            }

            foreach (var stamp in recipe.Stamps)
            {
                StampEllipse(pixels, stamp, 1f, stamp.Color);
            }

            if (recipe.Eyes != null)
            {
                foreach (var eye in recipe.Eyes)
                {
                    StampEllipse(pixels, eye, 1f, eye.Color);
                }
            }

            InsetAlpha(pixels);
            var texture = new Texture2D(Size, Size, TextureFormat.RGBA32, false);
            texture.SetPixels32(pixels);
            texture.Apply();
            byte[] png = texture.EncodeToPNG();
            Object.DestroyImmediate(texture);

            string folder = Path.Combine(fixturesRoot, recipe.Folder);
            Directory.CreateDirectory(folder);
            string pngPath = Path.Combine(folder, "creature.png");
            File.WriteAllBytes(pngPath, png);

            string hash;
            using (var sha = SHA256.Create())
            {
                hash = FileFixtureCatalog.ToHex(sha.ComputeHash(png));
            }

            var manifest = new CreatureManifest(
                1,
                recipe.CreatureId,
                1,
                recipe.DisplayName,
                recipe.Locomotion,
                recipe.ScaleClass,
                recipe.Anchor,
                recipe.Scale,
                recipe.MoveSpeed,
                recipe.TurnSpeed,
                "creature.png",
                hash);
            File.WriteAllText(Path.Combine(folder, "manifest.json"), ManifestJson.Write(manifest));
            return manifest;
        }

        static void StampEllipse(Color32[] pixels, Stamp stamp, float scale, Color32 color)
        {
            float cx = stamp.X * (Size - 1);
            float cy = (1f - stamp.Y) * (Size - 1);
            float rx = stamp.Rx * Size * scale;
            float ry = stamp.Ry * Size * scale;
            int minX = Mathf.Max(8, Mathf.FloorToInt(cx - rx - 2));
            int maxX = Mathf.Min(Size - 9, Mathf.CeilToInt(cx + rx + 2));
            int minY = Mathf.Max(8, Mathf.FloorToInt(cy - ry - 2));
            int maxY = Mathf.Min(Size - 9, Mathf.CeilToInt(cy + ry + 2));
            for (int y = minY; y <= maxY; y++)
            {
                for (int x = minX; x <= maxX; x++)
                {
                    float dx = (x - cx) / rx;
                    float dy = (y - cy) / ry;
                    float d = Mathf.Sqrt(dx * dx + dy * dy);
                    float alpha = d >= 1f ? 0f : (d > 0.9f ? Mathf.Clamp01((1f - d) / 0.1f) : 1f);
                    if (alpha <= 0.04f)
                    {
                        continue;
                    }

                    int i = y * Size + x;
                    pixels[i] = Blend(pixels[i], color, alpha * (color.a / 255f));
                }
            }
        }

        static Color32 Blend(Color32 dst, Color32 src, float a)
        {
            float da = dst.a / 255f;
            float outA = a + da * (1f - a);
            if (outA <= 0.001f)
            {
                return dst;
            }

            float r = (src.r * a + dst.r * da * (1f - a)) / outA;
            float g = (src.g * a + dst.g * da * (1f - a)) / outA;
            float b = (src.b * a + dst.b * da * (1f - a)) / outA;
            return new Color32((byte)r, (byte)g, (byte)b, (byte)(outA * 255f));
        }

        static Color32 Darken(Color32 color, float mul)
        {
            return new Color32((byte)(color.r * mul), (byte)(color.g * mul), (byte)(color.b * mul), color.a);
        }

        static void InsetAlpha(Color32[] pixels)
        {
            for (int y = 0; y < Size; y++)
            {
                for (int x = 0; x < Size; x++)
                {
                    if (x < 6 || y < 6 || x >= Size - 6 || y >= Size - 6)
                    {
                        pixels[y * Size + x] = new Color32(0, 0, 0, 0);
                    }
                }
            }
        }
    }
}
