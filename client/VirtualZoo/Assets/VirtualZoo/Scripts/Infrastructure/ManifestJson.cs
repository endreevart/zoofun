using System;
using System.Globalization;
using System.Text;
using VirtualZoo.Domain;
using UnityEngine;

namespace VirtualZoo.Infrastructure
{
    [Serializable]
    public sealed class ManifestDto
    {
        public int schemaVersion;
        public string creatureId;
        public int revision;
        public string displayName;
        public string locomotion;
        public string scaleClass;
        public float scale;
        public float moveSpeed;
        public float turnSpeed;
        public AnchorDto groundAnchor;
        public AssetsDto assets;
    }

    [Serializable]
    public sealed class AnchorDto
    {
        public float x;
        public float y;
    }

    [Serializable]
    public sealed class AssetsDto
    {
        public TextureDto texture;
    }

    [Serializable]
    public sealed class TextureDto
    {
        public string path;
        public string sha256;
    }

    public static class ManifestJson
    {
        public static bool TryParse(string json, out CreatureManifest manifest, out string error)
        {
            manifest = null;
            error = string.Empty;
            if (string.IsNullOrWhiteSpace(json))
            {
                error = "JSON is empty.";
                return false;
            }

            ManifestDto dto;
            try
            {
                dto = JsonUtility.FromJson<ManifestDto>(json);
            }
            catch (Exception exception)
            {
                error = exception.Message;
                return false;
            }

            if (dto == null)
            {
                error = "JSON did not deserialize.";
                return false;
            }

            if (!CreatureManifestValidator.TryParseLocomotion(dto.locomotion, out var locomotion))
            {
                error = "Unknown locomotion class.";
                return false;
            }

            if (dto.groundAnchor == null || dto.assets == null || dto.assets.texture == null)
            {
                error = "Required manifest fields are missing.";
                return false;
            }

            manifest = new CreatureManifest(
                dto.schemaVersion,
                dto.creatureId,
                dto.revision,
                dto.displayName,
                locomotion,
                dto.scaleClass,
                new GroundAnchor(dto.groundAnchor.x, dto.groundAnchor.y),
                dto.scale,
                dto.moveSpeed,
                dto.turnSpeed,
                dto.assets.texture.path,
                dto.assets.texture.sha256);
            return true;
        }

        public static string Write(CreatureManifest manifest)
        {
            var builder = new StringBuilder(512);
            builder.Append("{\n");
            builder.AppendFormat(CultureInfo.InvariantCulture, "  \"schemaVersion\": {0},\n", manifest.SchemaVersion);
            builder.AppendFormat("  \"creatureId\": \"{0}\",\n", manifest.CreatureId);
            builder.AppendFormat(CultureInfo.InvariantCulture, "  \"revision\": {0},\n", manifest.Revision);
            builder.AppendFormat("  \"displayName\": \"{0}\",\n", Escape(manifest.DisplayName));
            builder.AppendFormat("  \"locomotion\": \"{0}\",\n", manifest.Locomotion.ToString().ToLowerInvariant());
            builder.AppendFormat("  \"scaleClass\": \"{0}\",\n", manifest.ScaleClass);
            builder.AppendFormat(CultureInfo.InvariantCulture, "  \"scale\": {0:0.###},\n", manifest.Scale);
            builder.AppendFormat(CultureInfo.InvariantCulture, "  \"moveSpeed\": {0:0.###},\n", manifest.MoveSpeed);
            builder.AppendFormat(CultureInfo.InvariantCulture, "  \"turnSpeed\": {0:0.###},\n", manifest.TurnSpeed);
            builder.AppendFormat(
                CultureInfo.InvariantCulture,
                "  \"groundAnchor\": {{ \"x\": {0:0.###}, \"y\": {1:0.###} }},\n",
                manifest.GroundAnchor.X,
                manifest.GroundAnchor.Y);
            builder.Append("  \"assets\": {\n");
            builder.AppendFormat(
                "    \"texture\": {{ \"path\": \"{0}\", \"sha256\": \"{1}\" }}\n",
                manifest.TextureFileName,
                manifest.TextureSha256);
            builder.Append("  }\n");
            builder.Append("}\n");
            return builder.ToString();
        }

        private static string Escape(string value)
        {
            return (value ?? string.Empty).Replace("\\", "\\\\").Replace("\"", "\\\"");
        }
    }
}
