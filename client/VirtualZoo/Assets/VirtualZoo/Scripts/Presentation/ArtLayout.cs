using UnityEngine;

namespace VirtualZoo.Presentation
{
    public static class ArtLayout
    {
        public static readonly Vector3 PondCenter = new Vector3(-3.05f, 0f, 1.05f);
        public static readonly Vector3 HeroFocus = new Vector3(-0.65f, 0.42f, 1.70f);
        public static readonly Vector3 HeroCamera = new Vector3(0.85f, 4.15f, -11.40f);
        public static readonly Vector3 CloseupCamera = new Vector3(4.35f, 1.08f, -4.85f);
        public static readonly Vector3 CloseupFocus = new Vector3(3.55f, 0.46f, -2.75f);
        public static readonly Vector3 PondCamera = new Vector3(-5.45f, 1.48f, -1.55f);
        public static readonly Vector3 PondFocus = new Vector3(-2.15f, 0.34f, 0.55f);
        public static readonly float WaterHeight = 0.12f;
        public static readonly float HeroFov = 34f;

        public static readonly string[] HeroCreatureIds =
        {
            "berry-elephant",
            "mustard-dog",
            "lilac-cat",
            "butter-rabbit",
            "honey-bee",
            "cloud-dragon",
            "pond-duck",
            "coral-fish"
        };

        public static readonly string[] HeroManifestIds =
        {
            "a18c0001-7e2b-4c11-91a0-000000000001",
            "a18c0001-7e2b-4c11-91a0-000000000002",
            "a18c0001-7e2b-4c11-91a0-000000000003",
            "a18c0001-7e2b-4c11-91a0-000000000009",
            "a18c0001-7e2b-4c11-91a0-00000000000f",
            "a18c0001-7e2b-4c11-91a0-000000000010",
            "a18c0001-7e2b-4c11-91a0-000000000011",
            "a18c0001-7e2b-4c11-91a0-000000000012"
        };

        public static bool IsHero(string creatureId)
        {
            return Contains(HeroCreatureIds, creatureId) || Contains(HeroManifestIds, creatureId);
        }

        public static bool IsHeroFixture(string creatureId, string directoryPath)
        {
            if (IsHero(creatureId))
            {
                return true;
            }

            if (string.IsNullOrEmpty(directoryPath))
            {
                return false;
            }

            string folder = directoryPath.Replace('\\', '/').TrimEnd('/');
            int slash = folder.LastIndexOf('/');
            string name = slash >= 0 ? folder.Substring(slash + 1) : folder;
            return Contains(HeroCreatureIds, name);
        }

        static bool Contains(string[] list, string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return false;
            }

            for (int i = 0; i < list.Length; i++)
            {
                if (list[i] == value)
                {
                    return true;
                }
            }

            return false;
        }
    }
}
