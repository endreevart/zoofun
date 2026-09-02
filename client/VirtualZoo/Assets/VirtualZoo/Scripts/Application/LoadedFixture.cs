using VirtualZoo.Domain;

namespace VirtualZoo.Application
{
    public sealed class LoadedFixture
    {
        public LoadedFixture(CreatureManifest manifest, byte[] pngBytes, string directoryPath)
        {
            Manifest = manifest;
            PngBytes = pngBytes;
            DirectoryPath = directoryPath;
        }

        public CreatureManifest Manifest { get; }
        public byte[] PngBytes { get; }
        public string DirectoryPath { get; }
    }
}
