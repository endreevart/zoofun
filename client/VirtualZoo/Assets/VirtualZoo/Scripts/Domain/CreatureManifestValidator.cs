using System;

namespace VirtualZoo.Domain
{
    public static class CreatureManifestValidator
    {
        public const int SupportedSchemaVersion = 1;
        public const float MinScale = 0.35f;
        public const float MaxScale = 1.8f;
        public const float MinAnchorX = 0.2f;
        public const float MaxAnchorX = 0.8f;
        public const float MinAnchorY = 0.02f;
        public const float MaxAnchorY = 0.22f;
        public const float MinMoveSpeed = 0.2f;
        public const float MaxMoveSpeed = 3.5f;

        public static ValidationResult Validate(CreatureManifest manifest, bool textureExists)
        {
            if (manifest == null)
            {
                return ValidationResult.Fail("Manifest is null.");
            }

            if (manifest.SchemaVersion != SupportedSchemaVersion)
            {
                return ValidationResult.Fail("Unsupported schemaVersion.");
            }

            if (string.IsNullOrWhiteSpace(manifest.CreatureId))
            {
                return ValidationResult.Fail("creatureId is required.");
            }

            if (manifest.Revision < 1)
            {
                return ValidationResult.Fail("revision must be >= 1.");
            }

            if (string.IsNullOrWhiteSpace(manifest.DisplayName))
            {
                return ValidationResult.Fail("displayName is required.");
            }

            if (!IsAllowedScaleClass(manifest.ScaleClass))
            {
                return ValidationResult.Fail("scaleClass is not allowed.");
            }

            if (manifest.Scale < MinScale || manifest.Scale > MaxScale)
            {
                return ValidationResult.Fail("scale is out of bounds.");
            }

            if (manifest.GroundAnchor.X < MinAnchorX || manifest.GroundAnchor.X > MaxAnchorX)
            {
                return ValidationResult.Fail("groundAnchor.x is out of bounds.");
            }

            if (manifest.GroundAnchor.Y < MinAnchorY || manifest.GroundAnchor.Y > MaxAnchorY)
            {
                return ValidationResult.Fail("groundAnchor.y is out of bounds.");
            }

            if (manifest.MoveSpeed < MinMoveSpeed || manifest.MoveSpeed > MaxMoveSpeed)
            {
                return ValidationResult.Fail("moveSpeed is out of bounds.");
            }

            if (string.IsNullOrWhiteSpace(manifest.TextureFileName) ||
                !manifest.TextureFileName.EndsWith(".png", StringComparison.OrdinalIgnoreCase))
            {
                return ValidationResult.Fail("texture path must be a png.");
            }

            if (!textureExists)
            {
                return ValidationResult.Fail("texture is missing.");
            }

            if (string.IsNullOrWhiteSpace(manifest.TextureSha256) || manifest.TextureSha256.Length != 64)
            {
                return ValidationResult.Fail("texture sha256 is invalid.");
            }

            return ValidationResult.Ok();
        }

        public static bool TryParseLocomotion(string value, out LocomotionClass locomotion)
        {
            locomotion = LocomotionClass.Walk;
            if (string.IsNullOrWhiteSpace(value))
            {
                return false;
            }

            switch (value.Trim().ToLowerInvariant())
            {
                case "walk":
                    locomotion = LocomotionClass.Walk;
                    return true;
                case "hop":
                    locomotion = LocomotionClass.Hop;
                    return true;
                case "fly":
                    locomotion = LocomotionClass.Fly;
                    return true;
                case "float":
                    locomotion = LocomotionClass.Float;
                    return true;
                default:
                    return false;
            }
        }

        private static bool IsAllowedScaleClass(string scaleClass)
        {
            if (string.IsNullOrWhiteSpace(scaleClass))
            {
                return false;
            }

            switch (scaleClass.Trim().ToLowerInvariant())
            {
                case "small":
                case "medium":
                case "large":
                    return true;
                default:
                    return false;
            }
        }
    }
}
