using UnityEngine;
using VirtualZoo.Domain;

namespace VirtualZoo.Presentation
{
    public static class IdyllicLayout
    {
        public const string SceneName = "ZooIdyllicGarden";
        public const string ScenePath = "Assets/VirtualZoo/Scenes/ZooIdyllicGarden.unity";
        public const string VendorRoot = "Assets/Idyllic Fantasy Nature";
        public const string VendorVersion = "1.0";
        public const string VendorPublisher = "Edenity";
        public const string VendorProductId = "260042";
        public const float CameraFov = 34f;
        public const float WaterHeight = 0.078f;
        public const float MeadowExtent = 24f;

        public static readonly Vector3 PondCenter = new Vector3(-2.02f, 0f, 1.08f);
        public static readonly Vector2 PondExtents = new Vector2(1.48f, 1.68f);
        public static readonly Vector3 HeroFocus = new Vector3(0.08f, 0.48f, 1.85f);
        public static readonly Vector3 HeroCamera = new Vector3(-0.22f, 4.00f, -6.05f);
        public static readonly Vector3 CloseupCamera = new Vector3(1.18f, 1.28f, -1.42f);
        public static readonly Vector3 CloseupStand = new Vector3(1.22f, 0f, 1.22f);
        public static readonly Vector3 LightingCloseupCamera = new Vector3(2.22f, 1.08f, 0.55f);
        public static readonly Vector3 LightingCloseupFocus = new Vector3(1.22f, 0.48f, 1.22f);
        public static readonly Vector3 PondCamera = new Vector3(-4.15f, 1.78f, -1.25f);
        public static readonly Vector3 PondFocus = new Vector3(-1.95f, 0.28f, 1.12f);
        public static readonly Vector3 GateCamera = new Vector3(2.85f, 1.88f, 3.05f);
        public static readonly Vector3 GateFocus = new Vector3(0.12f, 1.52f, 6.45f);
        public static readonly Vector3 FlyFloatCamera = new Vector3(-2.35f, 1.85f, -3.05f);
        public static readonly Vector3 FlyFloatFocus = new Vector3(-1.75f, 0.82f, 0.88f);
        public static readonly Vector3 GatePosition = new Vector3(0.12f, 0f, 6.45f);
        public static readonly Vector3 BoundsMin = new Vector3(-9.5f, -0.5f, -8.5f);
        public static readonly Vector3 BoundsMax = new Vector3(9.5f, 7.2f, 12.5f);

        public static Vector3[] PathControlPoints()
        {
            return new[]
            {
                new Vector3(-0.04f, 0f, -1.48f),
                new Vector3(0.92f, 0f, -0.22f),
                new Vector3(1.12f, 0f, 0.88f),
                new Vector3(0.52f, 0f, 1.95f),
                new Vector3(0.04f, 0f, 3.05f),
                new Vector3(0.22f, 0f, 4.35f),
                new Vector3(0.12f, 0f, 5.28f)
            };
        }

        public static HabitatKind ZoneKindFor(LocomotionClass locomotion)
        {
            switch (locomotion)
            {
                case LocomotionClass.Hop:
                    return HabitatKind.Hop;
                case LocomotionClass.Fly:
                    return HabitatKind.Flight;
                case LocomotionClass.Float:
                    return HabitatKind.Water;
                default:
                    return HabitatKind.Ground;
            }
        }

        public static float CameraPitchDegrees()
        {
            Vector3 delta = HeroFocus - HeroCamera;
            Vector3 flat = new Vector3(delta.x, 0f, delta.z);
            if (flat.sqrMagnitude < 0.0001f)
            {
                return 90f;
            }

            return Mathf.Atan2(-delta.y, flat.magnitude) * Mathf.Rad2Deg;
        }
    }
}
