using System.Collections.Generic;
using VirtualZoo.Domain;

namespace VirtualZoo.Application
{
    public sealed class ZooBounds
    {
        public ZooBounds(float minX, float maxX, float minZ, float maxZ, float minY, float maxY)
        {
            MinX = minX;
            MaxX = maxX;
            MinZ = minZ;
            MaxZ = maxZ;
            MinY = minY;
            MaxY = maxY;
        }

        public float MinX { get; }
        public float MaxX { get; }
        public float MinZ { get; }
        public float MaxZ { get; }
        public float MinY { get; }
        public float MaxY { get; }

        public bool Contains(float x, float y, float z, float padding = 0f)
        {
            return x >= MinX - padding && x <= MaxX + padding &&
                   z >= MinZ - padding && z <= MaxZ + padding &&
                   y >= MinY - padding && y <= MaxY + padding;
        }
    }

    public static class UniqueIdGuard
    {
        public static bool AllUnique(IReadOnlyList<string> ids)
        {
            var seen = new HashSet<string>();
            for (int i = 0; i < ids.Count; i++)
            {
                if (string.IsNullOrWhiteSpace(ids[i]) || !seen.Add(ids[i]))
                {
                    return false;
                }
            }

            return true;
        }
    }
}
