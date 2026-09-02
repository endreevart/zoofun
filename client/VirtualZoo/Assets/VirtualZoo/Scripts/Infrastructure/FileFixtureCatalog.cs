using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using VirtualZoo.Application;
using VirtualZoo.Domain;

namespace VirtualZoo.Infrastructure
{
    public sealed class FileFixtureCatalog : IFixtureCatalog
    {
        private readonly string _fixturesRoot;

        public FileFixtureCatalog(string fixturesRoot)
        {
            _fixturesRoot = fixturesRoot;
        }

        public static string BundledRoot
        {
            get { return Path.Combine(UnityEngine.Application.streamingAssetsPath, "VirtualZoo", "Fixtures"); }
        }

        public static string DefaultEditorRoot => BundledRoot;

        public IReadOnlyList<LoadedFixture> LoadValidFixtures()
        {
            var loaded = new List<LoadedFixture>();
            if (string.IsNullOrWhiteSpace(_fixturesRoot) || !Directory.Exists(_fixturesRoot))
            {
                return loaded;
            }

            foreach (var directory in Directory.GetDirectories(_fixturesRoot))
            {
                var manifestPath = Path.Combine(directory, "manifest.json");
                if (!File.Exists(manifestPath))
                {
                    continue;
                }

                if (!ManifestJson.TryParse(File.ReadAllText(manifestPath), out var manifest, out _))
                {
                    continue;
                }

                var texturePath = Path.Combine(directory, manifest.TextureFileName);
                var textureExists = File.Exists(texturePath);
                byte[] pngBytes = textureExists ? File.ReadAllBytes(texturePath) : System.Array.Empty<byte>();
                if (textureExists && !MatchesHash(pngBytes, manifest.TextureSha256))
                {
                    continue;
                }

                var validation = CreatureManifestValidator.Validate(manifest, textureExists);
                if (!validation.IsValid)
                {
                    continue;
                }

                loaded.Add(new LoadedFixture(manifest, pngBytes, directory));
            }

            loaded.Sort((a, b) => string.CompareOrdinal(a.Manifest.CreatureId, b.Manifest.CreatureId));
            return loaded;
        }

        public static IReadOnlyList<string> LoadRawManifestErrors(string fixturesRoot)
        {
            var errors = new List<string>();
            if (!Directory.Exists(fixturesRoot))
            {
                errors.Add("Fixtures root is missing.");
                return errors;
            }

            foreach (var directory in Directory.GetDirectories(fixturesRoot))
            {
                var manifestPath = Path.Combine(directory, "manifest.json");
                if (!File.Exists(manifestPath))
                {
                    errors.Add(directory + ": missing manifest.json");
                    continue;
                }

                if (!ManifestJson.TryParse(File.ReadAllText(manifestPath), out var manifest, out var parseError))
                {
                    errors.Add(directory + ": " + parseError);
                    continue;
                }

                var texturePath = Path.Combine(directory, manifest.TextureFileName);
                var result = CreatureManifestValidator.Validate(manifest, File.Exists(texturePath));
                if (!result.IsValid)
                {
                    errors.Add(manifest.CreatureId + ": " + result.Error);
                }
            }

            return errors;
        }

        private static bool MatchesHash(byte[] bytes, string expectedHex)
        {
            using (var sha = SHA256.Create())
            {
                var hash = sha.ComputeHash(bytes);
                return ToHex(hash) == expectedHex;
            }
        }

        public static string ToHex(byte[] hash)
        {
            var chars = new char[hash.Length * 2];
            const string hex = "0123456789abcdef";
            for (int i = 0; i < hash.Length; i++)
            {
                chars[i * 2] = hex[hash[i] >> 4];
                chars[i * 2 + 1] = hex[hash[i] & 0xF];
            }

            return new string(chars);
        }
    }
}
