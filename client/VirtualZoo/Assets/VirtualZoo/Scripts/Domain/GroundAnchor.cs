namespace VirtualZoo.Domain
{
    public readonly struct GroundAnchor
    {
        public GroundAnchor(float x, float y)
        {
            X = x;
            Y = y;
        }

        public float X { get; }
        public float Y { get; }
    }
}
