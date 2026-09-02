using System;
using UnityEngine;
using VirtualZoo.Domain;

namespace VirtualZoo.EditorTools
{
    public readonly struct Stamp
    {
        public Stamp(float x, float y, float rx, float ry, Color32 color)
        {
            X = x;
            Y = y;
            Rx = rx;
            Ry = ry;
            Color = color;
        }

        public float X { get; }
        public float Y { get; }
        public float Rx { get; }
        public float Ry { get; }
        public Color32 Color { get; }
    }

    public sealed class FixtureRecipe
    {
        public string CreatureId;
        public string Folder;
        public string DisplayName;
        public LocomotionClass Locomotion;
        public string ScaleClass;
        public float Scale;
        public float MoveSpeed;
        public float TurnSpeed;
        public GroundAnchor Anchor;
        public Color32 Paper;
        public Stamp[] Stamps;
        public Stamp[] Eyes;
    }

    public static class FixtureRecipes
    {
        static Color32 C(byte r, byte g, byte b, byte a = 255) => new Color32(r, g, b, a);

        public static FixtureRecipe[] All()
        {
            return new[]
            {
                Walk("a18c0001-7e2b-4c11-91a0-000000000001", "berry-elephant", "Ягодный слон", "large", 1.35f, 0.85f,
                    C(232, 118, 168),
                    Body(0.50f, 0.46f, 0.28f, 0.22f, C(232, 118, 168)),
                    Extra(
                        S(0.22f, 0.50f, 0.16f, 0.07f, C(214, 92, 148)),
                        S(0.18f, 0.62f, 0.18f, 0.16f, C(232, 118, 168)),
                        S(0.78f, 0.58f, 0.16f, 0.18f, C(244, 168, 196)),
                        S(0.36f, 0.22f, 0.06f, 0.10f, C(196, 86, 132)),
                        S(0.48f, 0.20f, 0.06f, 0.10f, C(196, 86, 132)),
                        S(0.60f, 0.22f, 0.06f, 0.10f, C(196, 86, 132)),
                        S(0.70f, 0.24f, 0.06f, 0.09f, C(196, 86, 132)))),
                Walk("a18c0001-7e2b-4c11-91a0-000000000002", "mustard-dog", "Горчичный пёс", "medium", 1.05f, 1.25f,
                    C(232, 186, 74),
                    Body(0.52f, 0.42f, 0.24f, 0.16f, C(232, 186, 74)),
                    Extra(
                        S(0.30f, 0.52f, 0.12f, 0.12f, C(232, 186, 74)),
                        S(0.26f, 0.62f, 0.05f, 0.10f, C(176, 112, 58)),
                        S(0.34f, 0.62f, 0.05f, 0.10f, C(176, 112, 58)),
                        S(0.76f, 0.40f, 0.12f, 0.05f, C(196, 128, 64)),
                        S(0.42f, 0.22f, 0.05f, 0.12f, C(168, 108, 52)),
                        S(0.54f, 0.20f, 0.05f, 0.12f, C(168, 108, 52)),
                        S(0.64f, 0.22f, 0.05f, 0.11f, C(168, 108, 52)),
                        S(0.72f, 0.24f, 0.05f, 0.10f, C(168, 108, 52)))),
                Walk("a18c0001-7e2b-4c11-91a0-000000000003", "lilac-cat", "Сиреневый кот", "small", 0.85f, 1.35f,
                    C(196, 162, 232),
                    Body(0.50f, 0.40f, 0.20f, 0.14f, C(196, 162, 232)),
                    Extra(
                        S(0.32f, 0.54f, 0.10f, 0.10f, C(196, 162, 232)),
                        S(0.26f, 0.64f, 0.04f, 0.08f, C(148, 108, 196)),
                        S(0.36f, 0.64f, 0.04f, 0.08f, C(148, 108, 196)),
                        S(0.74f, 0.52f, 0.14f, 0.04f, C(148, 108, 196)),
                        S(0.42f, 0.22f, 0.04f, 0.10f, C(132, 96, 176)),
                        S(0.58f, 0.22f, 0.04f, 0.10f, C(132, 96, 176)))),
                Walk("a18c0001-7e2b-4c11-91a0-000000000004", "clover-cow", "Клеверная корова", "large", 1.28f, 0.9f,
                    C(244, 238, 214),
                    Body(0.52f, 0.44f, 0.26f, 0.18f, C(244, 238, 214)),
                    Extra(
                        S(0.30f, 0.54f, 0.11f, 0.11f, C(244, 238, 214)),
                        S(0.26f, 0.66f, 0.03f, 0.07f, C(214, 196, 148)),
                        S(0.34f, 0.66f, 0.03f, 0.07f, C(214, 196, 148)),
                        S(0.46f, 0.48f, 0.07f, 0.06f, C(92, 160, 112)),
                        S(0.62f, 0.40f, 0.08f, 0.07f, C(92, 160, 112)),
                        S(0.42f, 0.22f, 0.05f, 0.11f, C(214, 196, 148)),
                        S(0.54f, 0.20f, 0.05f, 0.12f, C(214, 196, 148)),
                        S(0.64f, 0.22f, 0.05f, 0.11f, C(214, 196, 148)),
                        S(0.72f, 0.24f, 0.05f, 0.10f, C(214, 196, 148)))),
                Walk("a18c0001-7e2b-4c11-91a0-000000000005", "peach-pig", "Персиковая свинка", "medium", 0.95f, 0.95f,
                    C(255, 176, 164),
                    Body(0.50f, 0.42f, 0.22f, 0.16f, C(255, 176, 164)),
                    Extra(
                        S(0.30f, 0.46f, 0.10f, 0.09f, C(255, 176, 164)),
                        S(0.22f, 0.46f, 0.07f, 0.05f, C(244, 140, 148)),
                        S(0.72f, 0.40f, 0.08f, 0.08f, C(244, 140, 148)),
                        S(0.40f, 0.22f, 0.05f, 0.10f, C(232, 132, 124)),
                        S(0.52f, 0.20f, 0.05f, 0.11f, C(232, 132, 124)),
                        S(0.62f, 0.22f, 0.05f, 0.10f, C(232, 132, 124)),
                        S(0.70f, 0.24f, 0.05f, 0.09f, C(232, 132, 124)))),
                Walk("a18c0001-7e2b-4c11-91a0-000000000006", "caramel-horse", "Карамельная лошадка", "large", 1.22f, 1.4f,
                    C(214, 154, 96),
                    Body(0.54f, 0.40f, 0.22f, 0.14f, C(214, 154, 96)),
                    Extra(
                        S(0.30f, 0.56f, 0.10f, 0.12f, C(214, 154, 96)),
                        S(0.24f, 0.70f, 0.07f, 0.08f, C(176, 108, 64)),
                        S(0.32f, 0.72f, 0.04f, 0.10f, C(176, 108, 64)),
                        S(0.78f, 0.44f, 0.14f, 0.05f, C(176, 108, 64)),
                        S(0.44f, 0.20f, 0.045f, 0.12f, C(156, 96, 56)),
                        S(0.54f, 0.18f, 0.045f, 0.13f, C(156, 96, 56)),
                        S(0.62f, 0.20f, 0.045f, 0.12f, C(156, 96, 56)),
                        S(0.70f, 0.22f, 0.045f, 0.11f, C(156, 96, 56)))),
                Walk("a18c0001-7e2b-4c11-91a0-000000000007", "moss-turtle", "Моховая черепаха", "medium", 0.9f, 0.55f,
                    C(122, 168, 108),
                    Body(0.50f, 0.42f, 0.24f, 0.14f, C(90, 140, 96)),
                    Extra(
                        S(0.50f, 0.46f, 0.20f, 0.12f, C(122, 168, 108)),
                        S(0.30f, 0.40f, 0.08f, 0.07f, C(122, 168, 108)),
                        S(0.28f, 0.48f, 0.05f, 0.04f, C(214, 186, 92)),
                        S(0.40f, 0.24f, 0.05f, 0.08f, C(90, 140, 96)),
                        S(0.52f, 0.22f, 0.05f, 0.08f, C(90, 140, 96)),
                        S(0.62f, 0.24f, 0.05f, 0.08f, C(90, 140, 96)),
                        S(0.72f, 0.26f, 0.05f, 0.07f, C(90, 140, 96)))),
                Walk("a18c0001-7e2b-4c11-91a0-000000000008", "sunset-dino", "Закатный дино", "large", 1.3f, 1.05f,
                    C(244, 132, 84),
                    Body(0.52f, 0.40f, 0.22f, 0.16f, C(244, 132, 84)),
                    Extra(
                        S(0.30f, 0.56f, 0.11f, 0.12f, C(244, 132, 84)),
                        S(0.50f, 0.58f, 0.04f, 0.08f, C(148, 72, 140)),
                        S(0.56f, 0.62f, 0.04f, 0.09f, C(148, 72, 140)),
                        S(0.62f, 0.58f, 0.04f, 0.08f, C(148, 72, 140)),
                        S(0.78f, 0.36f, 0.16f, 0.06f, C(196, 88, 64)),
                        S(0.42f, 0.20f, 0.05f, 0.11f, C(196, 88, 64)),
                        S(0.54f, 0.18f, 0.05f, 0.12f, C(196, 88, 64)))),
                Hop("a18c0001-7e2b-4c11-91a0-000000000009", "butter-rabbit", "Сливочный кролик", "small", 0.82f, 1.55f,
                    C(255, 236, 170),
                    Body(0.50f, 0.38f, 0.16f, 0.14f, C(255, 236, 170)),
                    Extra(
                        S(0.40f, 0.54f, 0.10f, 0.10f, C(255, 236, 170)),
                        S(0.34f, 0.72f, 0.04f, 0.14f, C(255, 220, 140)),
                        S(0.44f, 0.72f, 0.04f, 0.14f, C(255, 220, 140)),
                        S(0.66f, 0.32f, 0.10f, 0.06f, C(255, 248, 220)),
                        S(0.44f, 0.20f, 0.045f, 0.10f, C(232, 196, 120)),
                        S(0.56f, 0.20f, 0.045f, 0.10f, C(232, 196, 120)))),
                Hop("a18c0001-7e2b-4c11-91a0-00000000000a", "mango-roo", "Манговый прыгун", "medium", 1.12f, 1.6f,
                    C(244, 156, 64),
                    Body(0.52f, 0.42f, 0.16f, 0.18f, C(244, 156, 64)),
                    Extra(
                        S(0.40f, 0.62f, 0.10f, 0.10f, C(244, 156, 64)),
                        S(0.56f, 0.36f, 0.08f, 0.08f, C(220, 108, 52)),
                        S(0.72f, 0.28f, 0.14f, 0.05f, C(196, 88, 48)),
                        S(0.42f, 0.18f, 0.05f, 0.12f, C(196, 88, 48)),
                        S(0.54f, 0.16f, 0.06f, 0.14f, C(196, 88, 48)))),
                Hop("a18c0001-7e2b-4c11-91a0-00000000000b", "lime-frog", "Лаймовая лягушка", "small", 0.78f, 1.2f,
                    C(132, 204, 86),
                    Body(0.50f, 0.40f, 0.20f, 0.14f, C(132, 204, 86)),
                    Extra(
                        S(0.36f, 0.52f, 0.10f, 0.10f, C(132, 204, 86)),
                        S(0.64f, 0.40f, 0.10f, 0.08f, C(250, 220, 86)),
                        S(0.38f, 0.22f, 0.07f, 0.08f, C(96, 168, 72)),
                        S(0.58f, 0.22f, 0.07f, 0.08f, C(96, 168, 72)))),
                Hop("a18c0001-7e2b-4c11-91a0-00000000000c", "grape-hopper", "Виноградный кузнечик", "small", 0.8f, 1.7f,
                    C(156, 102, 196),
                    Body(0.50f, 0.40f, 0.18f, 0.10f, C(156, 102, 196)),
                    Extra(
                        S(0.32f, 0.50f, 0.08f, 0.08f, C(156, 102, 196)),
                        S(0.26f, 0.60f, 0.03f, 0.10f, C(92, 196, 164)),
                        S(0.32f, 0.60f, 0.03f, 0.10f, C(92, 196, 164)),
                        S(0.40f, 0.20f, 0.04f, 0.14f, C(92, 196, 164)),
                        S(0.58f, 0.20f, 0.04f, 0.14f, C(92, 196, 164)),
                        S(0.72f, 0.36f, 0.10f, 0.04f, C(196, 140, 220)))),
                Fly("a18c0001-7e2b-4c11-91a0-00000000000d", "sky-bird", "Небесная птичка", "small", 0.86f, 1.8f,
                    C(118, 186, 232),
                    Body(0.50f, 0.44f, 0.16f, 0.12f, C(118, 186, 232)),
                    Extra(
                        S(0.34f, 0.50f, 0.09f, 0.09f, C(118, 186, 232)),
                        S(0.28f, 0.50f, 0.06f, 0.04f, C(255, 176, 140)),
                        S(0.36f, 0.60f, 0.12f, 0.05f, C(255, 214, 186)),
                        S(0.64f, 0.58f, 0.14f, 0.05f, C(255, 214, 186)),
                        S(0.70f, 0.40f, 0.10f, 0.04f, C(90, 140, 196)))),
                Fly("a18c0001-7e2b-4c11-91a0-00000000000e", "petal-butterfly", "Лепестковая бабочка", "small", 0.88f, 1.5f,
                    C(244, 150, 196),
                    Body(0.50f, 0.42f, 0.06f, 0.16f, C(92, 64, 96)),
                    Extra(
                        S(0.34f, 0.52f, 0.14f, 0.12f, C(244, 150, 196)),
                        S(0.66f, 0.52f, 0.14f, 0.12f, C(196, 150, 232)),
                        S(0.34f, 0.32f, 0.12f, 0.10f, C(255, 210, 140)),
                        S(0.66f, 0.32f, 0.12f, 0.10f, C(255, 176, 214)))),
                Fly("a18c0001-7e2b-4c11-91a0-00000000000f", "honey-bee", "Медовая пчёлка", "small", 0.7f, 1.9f,
                    C(255, 204, 74),
                    Body(0.50f, 0.44f, 0.16f, 0.10f, C(255, 204, 74)),
                    Extra(
                        S(0.50f, 0.44f, 0.12f, 0.08f, C(64, 52, 48)),
                        S(0.42f, 0.44f, 0.04f, 0.09f, C(255, 204, 74)),
                        S(0.58f, 0.44f, 0.04f, 0.09f, C(255, 204, 74)),
                        S(0.34f, 0.56f, 0.10f, 0.05f, C(236, 246, 255)),
                        S(0.66f, 0.56f, 0.10f, 0.05f, C(236, 246, 255)))),
                Fly("a18c0001-7e2b-4c11-91a0-000000000010", "cloud-dragon", "Облачный дракончик", "medium", 1.1f, 1.65f,
                    C(164, 214, 236),
                    Body(0.50f, 0.42f, 0.20f, 0.12f, C(164, 214, 236)),
                    Extra(
                        S(0.30f, 0.54f, 0.10f, 0.10f, C(164, 214, 236)),
                        S(0.24f, 0.64f, 0.04f, 0.08f, C(255, 140, 124)),
                        S(0.34f, 0.64f, 0.04f, 0.08f, C(255, 140, 124)),
                        S(0.36f, 0.60f, 0.14f, 0.06f, C(255, 176, 164)),
                        S(0.66f, 0.58f, 0.14f, 0.06f, C(255, 176, 164)),
                        S(0.76f, 0.36f, 0.14f, 0.05f, C(118, 168, 196)))),
                Float("a18c0001-7e2b-4c11-91a0-000000000011", "pond-duck", "Прудовая уточка", "small", 0.84f, 0.85f,
                    C(255, 214, 74),
                    Body(0.52f, 0.40f, 0.16f, 0.12f, C(250, 248, 236)),
                    Extra(
                        S(0.36f, 0.50f, 0.10f, 0.10f, C(255, 214, 74)),
                        S(0.28f, 0.50f, 0.06f, 0.04f, C(244, 140, 64)),
                        S(0.70f, 0.34f, 0.08f, 0.06f, C(250, 248, 236)))),
                Float("a18c0001-7e2b-4c11-91a0-000000000012", "coral-fish", "Коралловая рыбка", "small", 0.8f, 1.1f,
                    C(255, 112, 124),
                    Body(0.50f, 0.46f, 0.20f, 0.12f, C(255, 112, 124)),
                    Extra(
                        S(0.28f, 0.46f, 0.08f, 0.08f, C(255, 112, 124)),
                        S(0.22f, 0.46f, 0.04f, 0.03f, C(255, 214, 96)),
                        S(0.74f, 0.46f, 0.10f, 0.10f, C(80, 196, 196)),
                        S(0.50f, 0.58f, 0.06f, 0.06f, C(80, 196, 196)),
                        S(0.50f, 0.34f, 0.06f, 0.06f, C(80, 196, 196)))),
                Float("a18c0001-7e2b-4c11-91a0-000000000013", "jelly-blob", "Ягодная медуза", "medium", 0.96f, 0.7f,
                    C(206, 168, 236),
                    Body(0.50f, 0.52f, 0.20f, 0.14f, C(206, 168, 236)),
                    Extra(
                        S(0.40f, 0.28f, 0.03f, 0.14f, C(186, 140, 220)),
                        S(0.50f, 0.24f, 0.03f, 0.16f, C(186, 140, 220)),
                        S(0.60f, 0.28f, 0.03f, 0.14f, C(186, 140, 220)),
                        S(0.50f, 0.56f, 0.08f, 0.06f, C(255, 214, 236)))),
                Float("a18c0001-7e2b-4c11-91a0-000000000014", "cream-swan", "Сливочный лебедь", "medium", 1.08f, 0.9f,
                    C(255, 248, 230),
                    Body(0.56f, 0.38f, 0.18f, 0.12f, C(255, 248, 230)),
                    Extra(
                        S(0.36f, 0.56f, 0.08f, 0.16f, C(255, 248, 230)),
                        S(0.30f, 0.70f, 0.07f, 0.07f, C(255, 248, 230)),
                        S(0.24f, 0.70f, 0.04f, 0.03f, C(244, 196, 96)),
                        S(0.72f, 0.36f, 0.10f, 0.08f, C(255, 236, 196)))),
            };
        }

        static Stamp S(float x, float y, float rx, float ry, Color32 c) => new Stamp(x, y, rx, ry, c);

        static Stamp[] Body(float x, float y, float rx, float ry, Color32 c) => new[] { S(x, y, rx, ry, c) };

        static Stamp[] Extra(params Stamp[] stamps) => stamps;

        static FixtureRecipe Walk(string id, string folder, string name, string scaleClass, float scale, float speed, Color32 paper, Stamp[] body, Stamp[] extra)
        {
            return Make(id, folder, name, LocomotionClass.Walk, scaleClass, scale, speed, 220f, paper, body, extra);
        }

        static FixtureRecipe Hop(string id, string folder, string name, string scaleClass, float scale, float speed, Color32 paper, Stamp[] body, Stamp[] extra)
        {
            return Make(id, folder, name, LocomotionClass.Hop, scaleClass, scale, speed, 260f, paper, body, extra);
        }

        static FixtureRecipe Fly(string id, string folder, string name, string scaleClass, float scale, float speed, Color32 paper, Stamp[] body, Stamp[] extra)
        {
            return Make(id, folder, name, LocomotionClass.Fly, scaleClass, scale, speed, 180f, paper, body, extra);
        }

        static FixtureRecipe Float(string id, string folder, string name, string scaleClass, float scale, float speed, Color32 paper, Stamp[] body, Stamp[] extra)
        {
            return Make(id, folder, name, LocomotionClass.Float, scaleClass, scale, speed, 140f, paper, body, extra);
        }

        static FixtureRecipe Make(
            string id, string folder, string name, LocomotionClass loco, string scaleClass, float scale, float speed, float turn,
            Color32 paper, Stamp[] body, Stamp[] extra)
        {
            var stamps = new Stamp[body.Length + extra.Length];
            Array.Copy(body, stamps, body.Length);
            Array.Copy(extra, 0, stamps, body.Length, extra.Length);
            var head = body[0];
            return new FixtureRecipe
            {
                CreatureId = id,
                Folder = folder,
                DisplayName = name,
                Locomotion = loco,
                ScaleClass = scaleClass,
                Scale = scale,
                MoveSpeed = speed,
                TurnSpeed = turn,
                Anchor = new GroundAnchor(0.50f, 0.08f),
                Paper = paper,
                Stamps = stamps,
                Eyes = new[]
                {
                    S(head.X - head.Rx * 0.28f, head.Y + head.Ry * 0.35f, 0.035f, 0.04f, C(255, 255, 255)),
                    S(head.X + head.Rx * 0.18f, head.Y + head.Ry * 0.35f, 0.035f, 0.04f, C(255, 255, 255)),
                    S(head.X - head.Rx * 0.26f, head.Y + head.Ry * 0.33f, 0.016f, 0.018f, C(48, 36, 40)),
                    S(head.X + head.Rx * 0.20f, head.Y + head.Ry * 0.33f, 0.016f, 0.018f, C(48, 36, 40))
                }
            };
        }
    }
}
