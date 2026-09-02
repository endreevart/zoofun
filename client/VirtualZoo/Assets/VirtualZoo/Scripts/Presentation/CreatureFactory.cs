using UnityEngine;
using VirtualZoo.Application;
using VirtualZoo.Domain;

namespace VirtualZoo.Presentation
{
    public sealed class CreatureFactory
    {
        readonly Camera _camera;

        public CreatureFactory(Camera camera)
        {
            _camera = camera;
        }

        public GameObject Create(LoadedFixture fixture, Transform parent, Transform[] waypoints, int seed)
        {
            if (fixture == null || fixture.Manifest == null || fixture.PngBytes == null || fixture.PngBytes.Length == 0)
            {
                return null;
            }

            var validation = CreatureManifestValidator.Validate(fixture.Manifest, true);
            if (!validation.IsValid)
            {
                return null;
            }

            var texture = new Texture2D(2, 2, TextureFormat.RGBA32, false);
            texture.wrapMode = TextureWrapMode.Clamp;
            texture.filterMode = FilterMode.Bilinear;
            if (!texture.LoadImage(fixture.PngBytes, false))
            {
                Object.Destroy(texture);
                return null;
            }

            texture.name = CreatureRuntimeAssets.RuntimePrefix + "Tex." + fixture.Manifest.CreatureId;

            var root = new GameObject(fixture.Manifest.DisplayName);
            root.transform.SetParent(parent, false);

            var visualRoot = new GameObject("VisualRoot");
            visualRoot.transform.SetParent(root.transform, false);

            var billboard = new GameObject("Billboard");
            billboard.transform.SetParent(visualRoot.transform, false);

            float height = Mathf.Clamp(fixture.Manifest.Scale * 1.38f, 1.08f, 1.62f);
            float ppu = texture.width / height;
            var sprite = Sprite.Create(
                texture,
                new Rect(0f, 0f, texture.width, texture.height),
                new Vector2(0.5f, Mathf.Clamp01(fixture.Manifest.GroundAnchor.Y)),
                ppu,
                0,
                SpriteMeshType.FullRect);

            sprite.name = CreatureRuntimeAssets.RuntimePrefix + "Sprite." + fixture.Manifest.CreatureId;
            var spriteMaterial = ZooMaterials.CreateSpriteMaterial(texture);
            spriteMaterial.name = CreatureRuntimeAssets.RuntimePrefix + "SpriteMat." + fixture.Manifest.CreatureId;
            var renderer = billboard.AddComponent<SpriteRenderer>();
            renderer.sprite = sprite;
            renderer.sharedMaterial = spriteMaterial;
            renderer.sortingOrder = 20;
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            renderer.receiveShadows = false;

            float width = height * 0.9f;
            var shadow = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            shadow.name = "ContactShadow";
            Object.Destroy(shadow.GetComponent<Collider>());
            shadow.transform.SetParent(root.transform, false);
            shadow.transform.localPosition = new Vector3(0f, 0.02f, 0.03f);
            shadow.transform.localScale = new Vector3(width * 0.58f, 0.035f, width * 0.34f);
            var shadowMaterial = ZooMaterials.CreateShadowBlob();
            shadowMaterial.name = CreatureRuntimeAssets.RuntimePrefix + "ShadowMat." + fixture.Manifest.CreatureId;
            var shadowRenderer = shadow.GetComponent<MeshRenderer>();
            shadowRenderer.sharedMaterial = shadowMaterial;
            shadowRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;

            var presentation = root.AddComponent<CreaturePresentation>();
            presentation.Configure(visualRoot.transform, billboard.transform, renderer, _camera);

            var assets = root.AddComponent<CreatureRuntimeAssets>();
            assets.Bind(texture, sprite, spriteMaterial, shadowMaterial);

            AddMotor(root, fixture.Manifest);
            var motor = root.GetComponent<CreatureMotor>();
            motor.Bind(fixture.Manifest, waypoints, seed, presentation);

            var identity = root.AddComponent<CreatureIdentity>();
            identity.Bind(fixture.Manifest);
            return root;
        }

        static void AddMotor(GameObject root, CreatureManifest manifest)
        {
            switch (manifest.Locomotion)
            {
                case LocomotionClass.Walk:
                    EnsureAgent(root);
                    root.AddComponent<WalkLocomotion>();
                    break;
                case LocomotionClass.Hop:
                    EnsureAgent(root);
                    root.AddComponent<HopLocomotion>();
                    break;
                case LocomotionClass.Fly:
                    root.AddComponent<FlyLocomotion>();
                    break;
                case LocomotionClass.Float:
                    root.AddComponent<FloatLocomotion>();
                    break;
            }
        }

        static void EnsureAgent(GameObject root)
        {
            var agent = root.GetComponent<UnityEngine.AI.NavMeshAgent>();
            if (agent == null)
            {
                agent = root.AddComponent<UnityEngine.AI.NavMeshAgent>();
            }

            agent.updateRotation = false;
            agent.updateUpAxis = true;
        }
    }

    public sealed class CreatureIdentity : MonoBehaviour
    {
        public string CreatureId { get; private set; }
        public LocomotionClass Locomotion { get; private set; }
        public string ScaleClass { get; private set; }
        public float Scale { get; private set; }

        public void Bind(CreatureManifest manifest)
        {
            CreatureId = manifest.CreatureId;
            Locomotion = manifest.Locomotion;
            ScaleClass = manifest.ScaleClass;
            Scale = manifest.Scale;
        }
    }
}
