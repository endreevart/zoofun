namespace VirtualZoo.Domain
{
    public sealed class CreatureManifest
    {
        public CreatureManifest(
            int schemaVersion,
            string creatureId,
            int revision,
            string displayName,
            LocomotionClass locomotion,
            string scaleClass,
            GroundAnchor groundAnchor,
            float scale,
            float moveSpeed,
            float turnSpeed,
            string textureFileName,
            string textureSha256)
        {
            SchemaVersion = schemaVersion;
            CreatureId = creatureId;
            Revision = revision;
            DisplayName = displayName;
            Locomotion = locomotion;
            ScaleClass = scaleClass;
            GroundAnchor = groundAnchor;
            Scale = scale;
            MoveSpeed = moveSpeed;
            TurnSpeed = turnSpeed;
            TextureFileName = textureFileName;
            TextureSha256 = textureSha256;
        }

        public int SchemaVersion { get; }
        public string CreatureId { get; }
        public int Revision { get; }
        public string DisplayName { get; }
        public LocomotionClass Locomotion { get; }
        public string ScaleClass { get; }
        public GroundAnchor GroundAnchor { get; }
        public float Scale { get; }
        public float MoveSpeed { get; }
        public float TurnSpeed { get; }
        public string TextureFileName { get; }
        public string TextureSha256 { get; }
    }
}
