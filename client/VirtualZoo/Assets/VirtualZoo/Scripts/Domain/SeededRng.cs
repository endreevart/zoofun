namespace VirtualZoo.Domain
{
    public sealed class SeededRng
    {
        private uint _state;

        public SeededRng(int seed)
        {
            _state = (uint)seed;
            if (_state == 0)
            {
                _state = 2463534242u;
            }
        }

        public uint NextUInt()
        {
            uint x = _state;
            x ^= x << 13;
            x ^= x >> 17;
            x ^= x << 5;
            _state = x;
            return x;
        }

        public float NextFloat()
        {
            return (NextUInt() & 0xFFFFFF) / 16777215f;
        }

        public int Range(int minInclusive, int maxExclusive)
        {
            if (maxExclusive <= minInclusive)
            {
                return minInclusive;
            }

            uint span = (uint)(maxExclusive - minInclusive);
            return minInclusive + (int)(NextUInt() % span);
        }

        public float Range(float minInclusive, float maxInclusive)
        {
            return minInclusive + (maxInclusive - minInclusive) * NextFloat();
        }
    }
}
