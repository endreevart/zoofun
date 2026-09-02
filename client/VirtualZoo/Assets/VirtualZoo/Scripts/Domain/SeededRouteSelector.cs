namespace VirtualZoo.Domain
{
    public static class SeededRouteSelector
    {
        public static int SelectIndex(int seed, string creatureId, int count)
        {
            if (count <= 0)
            {
                return 0;
            }

            unchecked
            {
                int hashed = seed * 397;
                if (!string.IsNullOrEmpty(creatureId))
                {
                    for (int i = 0; i < creatureId.Length; i++)
                    {
                        hashed = hashed * 31 + creatureId[i];
                    }
                }

                var rng = new SeededRng(hashed);
                return rng.Range(0, count);
            }
        }
    }
}
